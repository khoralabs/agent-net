import path from "node:path";

import {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getHarnessObservability,
  harnessAgentsDataDir,
  requireChatBaseUrl,
  requireChatToken,
  requireKhoraBaseUrl,
  requireMemoriesAdminToken,
  requireMemoriesBaseUrl,
  requireRelayBaseUrl,
  startNetworkHarness,
} from "@khoralabs/agent-net";
import {
  runExecuteAgentResponse,
  runNbcNegotiationModelTurn,
  runPrepareNbcTurn,
} from "@khoralabs/agent-net/ai-sdk";
import type {
  EconomyConfig,
  EconomyNegotiateRuntime,
  SocietyConfig,
  SocietyInvitationActions,
  SocietyRuntime,
} from "@khoralabs/agent-net/economy";
import {
  attachEconomyNegotiateRuntime,
  createEconomyNegotiateRuntime,
  createEconomyNegotiationOpener,
  createSocietyActorTools,
  createSocietyChainStatusNotifier,
  createSocietyExperienceActions,
  createSocietyNegotiations,
  createSocietyRuntime,
  getEconomySession,
  indexEconomyExperience,
  listEconomyExperience,
  resolveEconomyAgentWorkflowDeps,
  serializeSocietyNbcTurns,
  setupEconomy,
  teardownEconomy,
} from "@khoralabs/agent-net/economy";
import { installMemoriesOntology } from "@khoralabs/agent-net/memories";
import { registerNbcInternalNegotiationRoutes } from "@khoralabs/agent-net/negotiate";
import { createSqliteNetworkEventPersistencePlugin } from "@khoralabs/agent-net/network-events/sqlite";
import { createAutonomousSmokeScenario } from "./economy/autonomous-smoke-scenario.ts";
import { getEconomyScenario } from "./economy/scenario-registry.ts";
import { registerSmokeEconomyScenario } from "./economy/smoke-scenario.ts";
import { referenceMemoriesOntology } from "./memories/ontology.ts";
import { installReferenceObservability } from "./observability/install.ts";
import { requireKhoraReachable, requireReferenceStackReachable } from "./services/stack-health.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";

function parseArgs(argv: string[]): {
  config: EconomyConfig;
  scenarioId: string;
  khoraBaseUrl?: string;
  relayBaseUrl?: string;
  memoriesBaseUrl?: string;
  chatBaseUrl?: string;
  chatToken?: string;
  turnsPerActor: number;
  cadenceMs: number;
  maxConcurrentActors?: number;
} {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      args.set(key, value);
      i++;
    } else {
      args.set(key, "true");
    }
  }

  const actorCount = Number.parseInt(args.get("actors") ?? "2", 10);
  const labels = (args.get("labels") ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
  const dataDir = resolveHarnessDataDir(args.get("data-dir"));
  const sessionId = args.get("session-id")?.trim() || crypto.randomUUID();
  const scenarioId = args.get("scenario")?.trim() || "autonomous-smoke";
  if (scenarioId !== "autonomous-smoke") {
    throw new Error(`unknown society scenario ${scenarioId}`);
  }

  return {
    scenarioId,
    turnsPerActor: Number.parseInt(args.get("max-actor-turns") ?? "2", 10),
    cadenceMs: Number.parseInt(args.get("cadence-ms") ?? "60000", 10),
    ...(args.has("max-concurrent-actors")
      ? {
          maxConcurrentActors: Number.parseInt(args.get("max-concurrent-actors") ?? "", 10),
        }
      : {}),
    config: {
      sessionId,
      dataDir,
      actorCount,
      maxTokenBudget: Number.parseInt(args.get("max-tokens") ?? "100000", 10),
      maxRounds: Number.parseInt(args.get("max-rounds") ?? "1", 10),
      model: {
        id: args.get("model") ?? "zai/glm-5.2-fast",
        maxSteps: Number.parseInt(args.get("max-steps") ?? "8", 10),
      },
      ...(labels.length > 0 ? { actorLabels: labels } : {}),
    },
    ...(args.get("khora-url")?.trim() ? { khoraBaseUrl: args.get("khora-url")?.trim() } : {}),
    ...(args.get("relay-url")?.trim() ? { relayBaseUrl: args.get("relay-url")?.trim() } : {}),
    ...(args.get("memories-url")?.trim()
      ? { memoriesBaseUrl: args.get("memories-url")?.trim() }
      : {}),
    ...(args.get("chat-url")?.trim() ? { chatBaseUrl: args.get("chat-url")?.trim() } : {}),
    ...(args.get("chat-token")?.trim() ? { chatToken: args.get("chat-token")?.trim() } : {}),
  };
}

function startNbcApi(runtime: EconomyNegotiateRuntime) {
  const token = crypto.randomUUID();
  const routes = registerNbcInternalNegotiationRoutes({
    requireAuth: (req) =>
      req.headers.get("authorization") === `Bearer ${token}`
        ? null
        : Response.json({ error: "Unauthorized" }, { status: 401 }),
    sessions: runtime.sessions,
    host: {
      getChain: (chainId) => {
        const chain = runtime.getChain(chainId);
        if (chain?.vellumSessionId === undefined) return null;
        return { ...chain, id: chainId, sessionId: chain.vellumSessionId };
      },
      onTurnCommitted: () => undefined,
      onLeft: ({ chainId, detail }) =>
        runtime.onStatus(chainId, { status: "completed", outcome: "left", detail }),
    },
    notifyChainChanged: (event) => runtime.notifyChainChanged(event),
  });
  const server = Bun.serve({ port: 0, routes });
  process.env.AGENTS_BASE_URL = server.url.toString().replace(/\/$/, "");
  process.env.AGENTS_INTERNAL_TOKEN = token;
  return server;
}

function getSocietyScenario(id: string, actorDids: string[], turnsPerActor: number) {
  if (id === "autonomous-smoke") {
    return createAutonomousSmokeScenario({ actorDids, turnsPerActor });
  }
  throw new Error(`unknown society scenario ${id}`);
}

function nbcStartTurn(sessionId: string, modelId: string) {
  return async (turn: {
    chainId: string;
    asDid: string;
    peerDid: string;
    initiatorDid: string;
    turnIndex: number;
    maxTurns: number;
    objective?: string;
    constraints?: string;
  }) => {
    const runId = crypto.randomUUID();
    const params = { ...turn, sessionId, modelId, runId };
    const prepared = await runPrepareNbcTurn(params);
    const result = await runNbcNegotiationModelTurn({
      params,
      prepared,
      runId,
      timeoutMs: 60_000,
      maxAttempts: 2,
      describeFailure: (error) => (error instanceof Error ? error.message : String(error)),
      onRetryableTimeout: (error) => {
        throw error;
      },
      isAbortError: (error) => error instanceof Error && error.name === "AbortError",
      onExhausted: (detail) => {
        throw new Error(detail);
      },
    });
    return { runId, tokensUsed: result.tokensUsed };
  };
}

/**
 * Reference economy CLI.
 * Spawns persistent actors, then lets mailbox wakes and actor tools drive work.
 * Legacy round workflows remain available in `workflows/economy.ts`.
 */
async function main(): Promise<void> {
  registerSmokeEconomyScenario();
  const parsed = parseArgs(process.argv.slice(2));
  const { config, scenarioId } = parsed;

  const networkEvents = createSqliteNetworkEventPersistencePlugin({ dataDir: config.dataDir });
  bindNetworkSessionContext({ sessionId: config.sessionId });
  installReferenceObservability({
    serviceName: "network-harness-economy",
    sessionJsonlPath: networkEvents.sessionJsonlPath(config.sessionId),
  });
  const logger = getHarnessObservability().createLogger({
    name: "network-harness-economy",
    source: "economy",
  });

  const memoriesBaseUrl = requireMemoriesBaseUrl(parsed.memoriesBaseUrl);
  const relayBaseUrl = requireRelayBaseUrl(parsed.relayBaseUrl);
  const chatBaseUrl = requireChatBaseUrl(parsed.chatBaseUrl);
  const chatToken = requireChatToken(parsed.chatToken);
  const khoraBaseUrl = requireKhoraBaseUrl(parsed.khoraBaseUrl);

  await requireKhoraReachable(khoraBaseUrl);
  await requireReferenceStackReachable({
    memoriesBaseUrl,
    relayBaseUrl,
    chatBaseUrl,
  });

  const harness = await startNetworkHarness({
    dataDir: config.dataDir,
    chatBaseUrl,
    chatToken,
    networkEvents,
    khoraBaseUrl,
    relayBaseUrl,
    memoriesBaseUrl,
    memoriesAdminToken: requireMemoriesAdminToken(undefined),
  });
  installMemoriesOntology(referenceMemoriesOntology);

  let toreDown = false;
  try {
    const setupScenario = getEconomyScenario("smoke-lifecycle");
    logger.info(
      {
        sessionId: config.sessionId,
        dataDir: path.resolve(config.dataDir),
        actorCount: config.actorCount,
        scenarioId,
      },
      "economy.starting",
    );

    const { sessionId, actors } = await setupEconomy({
      harness,
      config,
      ontology: referenceMemoriesOntology,
      scenario: setupScenario,
    });
    let nbcServer: ReturnType<typeof Bun.serve> | undefined;
    try {
      const actorDids = actors.map((actor) => actor.did);
      const societyConfig: SocietyConfig = {
        sessionId,
        dataDir: config.dataDir,
        actorDids,
        maxTokenBudget: config.maxTokenBudget,
        maxActorTurns: parsed.turnsPerActor,
        cadenceMs: parsed.cadenceMs,
        ...(parsed.maxConcurrentActors !== undefined
          ? { maxConcurrentActors: parsed.maxConcurrentActors }
          : {}),
      };
      const societyScenario = getSocietyScenario(scenarioId, actorDids, parsed.turnsPerActor);
      let invitations!: SocietyInvitationActions;
      const experience = createSocietyExperienceActions(config.dataDir, sessionId);
      const runtime: SocietyRuntime = createSocietyRuntime({
        config: societyConfig,
        scenario: societyScenario,
        turnTimeoutMs: 120_000,
        runTurn: async ({ actorDid, wake, observation }) => {
          const actor = actors.find((entry) => entry.did === actorDid);
          if (actor === undefined) throw new Error(`actor ${actorDid} not found`);
          const deps = await resolveEconomyAgentWorkflowDeps(sessionId, actorDid);
          const result = await runExecuteAgentResponse(
            {
              runId: crypto.randomUUID(),
              agent: {
                id: actor.agentId,
                name: `Economy actor ${actor.label}`,
                actingFor: { type: "agent", id: actorDid },
              },
              model: config.model,
              context: {
                sessionId,
                threadId: actor.selfThreadId,
                messages: [],
                instructions: [
                  "You are an autonomous society actor. Choose your own actions and counterparties. Use tools only when they advance your private objective; never assume an invitation is accepted.",
                  `Private observation: ${JSON.stringify({ wake, observation })}`,
                ],
              },
              output: {
                chat: { threadId: actor.selfThreadId, streamDeltas: false },
              },
            },
            {
              ...deps,
              society: createSocietyActorTools({
                actorDid,
                runtime,
                invitations,
                experience,
              }),
            },
          );
          return { tokensUsed: result.usage?.totalTokens ?? 0 };
        },
      });
      const session = getEconomySession(sessionId);
      const resolveActors = (initiatorDid: string, responderDid: string) => {
        const initiator = session.agents.find((agent) => agent.did === initiatorDid);
        const responder = session.agents.find((agent) => agent.did === responderDid);
        if (initiator === undefined || responder === undefined) {
          throw new Error("negotiation actor is not in this society");
        }
        return { initiator, responder };
      };
      const notifyChainStatus = createSocietyChainStatusNotifier(runtime);
      const indexedChains = new Set<string>();
      let negotiate!: EconomyNegotiateRuntime;
      negotiate = createEconomyNegotiateRuntime({
        localDids: actorDids,
        startTurn: serializeSocietyNbcTurns(runtime, nbcStartTurn(sessionId, config.model.id)),
        onChainStatus: async (chain, patch) => {
          await notifyChainStatus(chain, patch);
          if (
            indexedChains.has(chain.chainId) ||
            (chain.status !== "completed" && chain.status !== "failed")
          ) {
            return;
          }
          indexedChains.add(chain.chainId);
          const snapshot = await negotiate.getSnapshot(chain.chainId).catch(() => null);
          const prior = (
            await listEconomyExperience(config.dataDir, sessionId, chain.initiatorDid, {
              peerDid: chain.counterpartyDid,
            })
          ).at(-1);
          const now = Date.now();
          await indexEconomyExperience({
            dataDir: config.dataDir,
            sessionId,
            encounter: {
              id: chain.chainId,
              sessionId,
              roundIndex: 0,
              initiatorDid: chain.initiatorDid,
              counterpartyDid: chain.counterpartyDid,
              chainId: chain.chainId,
              status: chain.status,
              isRepeat: prior !== undefined,
              ...(prior !== undefined ? { priorEncounterId: prior.encounterId } : {}),
              turnsCompleted: chain.turnsCompleted,
              tokensUsed: chain.tokensUsed,
              ...(chain.negotiationOutcome != null
                ? { terminalOutcome: chain.negotiationOutcome }
                : {}),
              createdAtMs: now,
              updatedAtMs: now,
            },
            ...(chain.relationshipRef !== undefined
              ? { relationshipRef: chain.relationshipRef }
              : {}),
            ...(chain.vellumSessionId !== undefined
              ? { vellumSessionId: chain.vellumSessionId }
              : {}),
            ...(snapshot !== null ? { graph: snapshot.graph } : {}),
          });
        },
      });
      attachEconomyNegotiateRuntime(session, negotiate);
      nbcServer = startNbcApi(negotiate);
      invitations = createSocietyNegotiations({
        config: societyConfig,
        runtime,
        open: createEconomyNegotiationOpener({
          runtime: negotiate,
          resolveActors,
          vellumOptions: {
            relayBaseUrl,
            agentsDataDir: harnessAgentsDataDir(config.dataDir),
            vellumDataDir: path.join(config.dataDir, "vellum"),
          },
        }),
      });

      const result = await runtime.runUntilDone();
      logger.info({ result }, "economy.completed");
    } finally {
      nbcServer?.stop(true);
      // Clear bound session before teardown's harness.stop() so it does not
      // fire-and-forget harness.stopped against a DB it immediately closes.
      clearNetworkSessionContext();
      await teardownEconomy(sessionId);
      toreDown = true;
    }
  } finally {
    clearNetworkSessionContext();
    if (!toreDown) harness.stop();
  }
}

await main();
