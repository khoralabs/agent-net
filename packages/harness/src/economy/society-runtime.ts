import {
  claimActorWake,
  enqueueActorWake,
  initializeSocietyState,
  listDueActorWakes,
  loadSocietyState,
  markSocietyPrepared,
  recordSocietyTurn,
  recoverActorWakes,
  settleActorWake,
  updateSocietyStatus,
} from "./society-state.ts";
import type {
  ActorWake,
  ActorWakeReason,
  SocietyActorTurn,
  SocietyConfig,
  SocietyRunResult,
  SocietyScenario,
} from "./society-types.ts";

export type SocietyRuntime = {
  start(): Promise<void>;
  enqueue(input: {
    actorDid: string;
    reason: ActorWakeReason;
    payload?: unknown;
    dueAtMs?: number;
    dedupeKey?: string;
  }): Promise<ActorWake>;
  requestWake(actorDid: string, payload?: unknown, dueAtMs?: number): Promise<ActorWake>;
  deliverEvent(actorDid: string, payload: unknown, dedupeKey?: string): Promise<ActorWake>;
  deliverNegotiation(actorDid: string, payload: unknown, dedupeKey?: string): Promise<ActorWake>;
  pump(): Promise<void>;
  runUntilDone(): Promise<SocietyRunResult>;
  stop(): Promise<void>;
};

export type CreateSocietyRuntimeInput = {
  config: SocietyConfig;
  scenario: SocietyScenario;
  runTurn: SocietyActorTurn;
  pollMs?: number;
  turnTimeoutMs?: number;
};

function validateConfig(config: SocietyConfig): void {
  if (config.sessionId.trim().length === 0) throw new Error("sessionId is required");
  if (config.dataDir.trim().length === 0) throw new Error("dataDir is required");
  if (config.actorDids.length === 0) throw new Error("actorDids must not be empty");
  if (new Set(config.actorDids).size !== config.actorDids.length) {
    throw new Error("actorDids must be unique");
  }
  if (!Number.isSafeInteger(config.maxTokenBudget) || config.maxTokenBudget <= 0) {
    throw new Error("maxTokenBudget must be a positive integer");
  }
  if (!Number.isSafeInteger(config.maxActorTurns) || config.maxActorTurns <= 0) {
    throw new Error("maxActorTurns must be a positive integer");
  }
  if (
    config.maxConcurrentActors !== undefined &&
    (!Number.isSafeInteger(config.maxConcurrentActors) || config.maxConcurrentActors <= 0)
  ) {
    throw new Error("maxConcurrentActors must be a positive integer");
  }
}

export function createSocietyRuntime(input: CreateSocietyRuntimeInput): SocietyRuntime {
  validateConfig(input.config);
  const { config, scenario, runTurn } = input;
  const pollMs = input.pollMs ?? 25;
  const cadenceMs = config.cadenceMs ?? 60_000;
  const maxConcurrent = Math.min(
    config.maxConcurrentActors ?? config.actorDids.length,
    config.actorDids.length,
  );
  const activeActors = new Set<string>();
  const activeTasks = new Set<Promise<void>>();
  const controllers = new Map<string, AbortController>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let started = false;
  let startPromise: Promise<void> | undefined;
  let stopping = false;
  let pumping = false;
  let pumpRequested = false;
  let lastPeriodicBucket = -1;
  let requestedTermination: SocietyRunResult["termination"] | undefined;

  const enqueue: SocietyRuntime["enqueue"] = async (wakeInput) => {
    const wake = await enqueueActorWake(config, wakeInput);
    if (started && !stopping) void runtime.pump();
    return wake;
  };

  async function schedulePeriodicWakes(now = Date.now()): Promise<void> {
    if (cadenceMs <= 0) return;
    const bucket = Math.floor(now / cadenceMs);
    if (bucket === lastPeriodicBucket) return;
    await Promise.all(
      config.actorDids.map((actorDid) =>
        enqueue({
          actorDid,
          reason: "periodic",
          dueAtMs: now,
          dedupeKey: `periodic:${actorDid}:${bucket}`,
        }),
      ),
    );
    lastPeriodicBucket = bucket;
  }

  async function execute(wake: ActorWake): Promise<void> {
    const controller = new AbortController();
    controllers.set(wake.actorDid, controller);
    const timeout =
      input.turnTimeoutMs === undefined
        ? undefined
        : setTimeout(
            () => controller.abort(new Error(`actor turn ${wake.id} timed out`)),
            input.turnTimeoutMs,
          );
    try {
      const observation = await scenario.observe({ actorDid: wake.actorDid, wake });
      const result = await runTurn({
        actorDid: wake.actorDid,
        wake: { ...wake, status: "running", attempts: wake.attempts + 1 },
        observation,
        signal: controller.signal,
      });
      if (!Number.isSafeInteger(result.tokensUsed) || result.tokensUsed < 0) {
        throw new Error("actor turn tokensUsed must be a non-negative integer");
      }
      await recordSocietyTurn(config.dataDir, config.sessionId, wake.actorDid, result.tokensUsed);
      await settleActorWake(config.dataDir, wake.id, "completed");
      await scenario.afterTurn?.({
        actorDid: wake.actorDid,
        wakeId: wake.id,
        tokensUsed: result.tokensUsed,
      });
      if (await scenario.shouldTerminate()) {
        requestedTermination = "scenario";
        stopping = true;
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await settleActorWake(
        config.dataDir,
        wake.id,
        stopping && controller.signal.aborted ? "pending" : "failed",
        message,
      );
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      controllers.delete(wake.actorDid);
      activeActors.delete(wake.actorDid);
    }
  }

  const runtime: SocietyRuntime = {
    start() {
      if (started) return Promise.resolve();
      if (startPromise !== undefined) return startPromise;
      startPromise = (async () => {
        stopping = false;
        requestedTermination = undefined;
        const state = await initializeSocietyState(config);
        await recoverActorWakes(config.dataDir, config.sessionId);
        await updateSocietyStatus(config.dataDir, config.sessionId, "running");
        if (!state.prepared) {
          await scenario.prepare?.();
          await markSocietyPrepared(config.dataDir, config.sessionId);
        }
        await Promise.all(
          config.actorDids.map((actorDid) =>
            enqueue({
              actorDid,
              reason: "initial",
              dedupeKey: `initial:${actorDid}`,
            }),
          ),
        );
        await schedulePeriodicWakes();
        started = true;
        if (timer !== undefined) clearInterval(timer);
        timer = setInterval(() => {
          void schedulePeriodicWakes().then(() => runtime.pump());
        }, pollMs);
        await runtime.pump();
      })().finally(() => {
        startPromise = undefined;
      });
      return startPromise;
    },

    enqueue,

    requestWake(actorDid, payload, dueAtMs) {
      return enqueue({ actorDid, reason: "requested", payload, dueAtMs });
    },

    deliverEvent(actorDid, payload, dedupeKey) {
      return enqueue({ actorDid, reason: "event", payload, dedupeKey });
    },

    deliverNegotiation(actorDid, payload, dedupeKey) {
      return enqueue({ actorDid, reason: "negotiation", payload, dedupeKey });
    },

    async pump() {
      if (!started || stopping) return;
      if (pumping) {
        pumpRequested = true;
        return;
      }
      pumping = true;
      try {
        do {
          pumpRequested = false;
          const state = await loadSocietyState(config.dataDir, config.sessionId);
          if (state.tokensUsed >= config.maxTokenBudget) return;
          if (activeTasks.size >= maxConcurrent) return;
          const due = await listDueActorWakes(config.dataDir, config.sessionId);
          for (const wake of due) {
            if (activeTasks.size >= maxConcurrent) break;
            if (activeActors.has(wake.actorDid)) continue;
            if ((state.actorTurns[wake.actorDid] ?? 0) >= config.maxActorTurns) {
              await settleActorWake(
                config.dataDir,
                wake.id,
                "cancelled",
                "actor turn limit reached",
              );
              continue;
            }
            if (!(await claimActorWake(config.dataDir, wake.id))) continue;
            activeActors.add(wake.actorDid);
            const task = execute(wake);
            activeTasks.add(task);
            void task
              .finally(() => {
                activeTasks.delete(task);
                if (!stopping) void runtime.pump();
              })
              .catch(() => undefined);
          }
        } while (pumpRequested && !stopping && activeTasks.size < maxConcurrent);
      } finally {
        pumping = false;
      }
    },

    async runUntilDone() {
      await runtime.start();
      let termination: SocietyRunResult["termination"] = requestedTermination ?? "stopped";
      while (!stopping) {
        await runtime.pump();
        const state = await loadSocietyState(config.dataDir, config.sessionId);
        if (state.tokensUsed >= config.maxTokenBudget) {
          termination = "token-budget";
          break;
        }
        if (config.actorDids.every((did) => (state.actorTurns[did] ?? 0) >= config.maxActorTurns)) {
          termination = "turn-limit";
          break;
        }
        if (await scenario.shouldTerminate()) {
          termination = "scenario";
          requestedTermination = termination;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      termination = requestedTermination ?? termination;
      stopping = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      await Promise.allSettled(activeTasks);
      const state = await loadSocietyState(config.dataDir, config.sessionId);
      await updateSocietyStatus(config.dataDir, config.sessionId, "completed");
      started = false;
      return {
        sessionId: config.sessionId,
        turnsCompleted: state.turnsCompleted,
        tokensUsed: state.tokensUsed,
        termination,
      };
    },

    async stop() {
      if (!started) return;
      stopping = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      for (const controller of controllers.values()) controller.abort(new Error("society stopped"));
      await Promise.allSettled(activeTasks);
      await updateSocietyStatus(config.dataDir, config.sessionId, "stopped");
      started = false;
    },
  };

  return runtime;
}
