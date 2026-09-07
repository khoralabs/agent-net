/**
 * Per-economy-session Vellum/NBC encounter registry.
 * Owns chain index, concurrent pair status, and NBC host callbacks.
 */
import type { AgentActor } from "../agent/actor.ts";
import type {
  NbcLoopChain,
  NbcLoopHost,
  NbcLoopStartTurnInput,
  NbcLoopStatusPatch,
} from "../agent/social/negotiate/nbc/loop-host.ts";
import { type NbcLoopHandle, startNbcLoop } from "../agent/social/negotiate/nbc/nbc-loop.ts";
import type { VellumPairOptions } from "../agent/social/negotiate/vellum.ts";
import {
  createVellumChainSessionRegistry,
  type VellumChainSessionRegistry,
} from "../agent/social/negotiate/vellum-sessions.ts";

import type { EconomyEncounterRunner } from "./run-round.ts";
import type { EconomyEncounter, EconomyScheduledEncounter } from "./types.ts";

export type EconomyChainRecord = NbcLoopChain & {
  encounterId: string;
  chainId: string;
  vellumSessionId?: string;
  relationshipRef?: string;
};

export type EconomyNegotiateRuntime = {
  sessions: VellumChainSessionRegistry;
  getChain(chainId: string): EconomyChainRecord | null;
  listChains(): EconomyChainRecord[];
  onStatus(chainId: string, patch: NbcLoopStatusPatch): void;
  localDids(): readonly string[];
  startTurn(input: NbcLoopStartTurnInput): Promise<{ runId?: string } | undefined>;
  waitForTerminal(chainId: string, opts?: { timeoutMs?: number }): Promise<EconomyChainRecord>;
  openAndRunEncounter(input: {
    encounter: EconomyEncounter;
    scheduled: EconomyScheduledEncounter;
    initiator: AgentActor;
    responder: AgentActor;
    vellumOptions: VellumPairOptions;
    maxTurns?: number;
    objective?: string;
    constraints?: string;
  }): Promise<{
    chainId: string;
    channelId: string;
    vellumSessionId: string;
    turnsCompleted: number;
    terminalOutcome?: string;
    status: EconomyEncounter["status"];
    relationshipRef?: string;
  }>;
  stop(): void;
};

export type CreateEconomyNegotiateRuntimeInput = {
  localDids: readonly string[];
  sessions?: VellumChainSessionRegistry;
  startTurn?: NbcLoopHost["startTurn"];
  /**
   * When set, skips live Vellum open (unit/integration tests).
   * The NBC loop is still started for host adapter coverage.
   */
  openChain?: (input: {
    chainId: string;
    initiator: AgentActor;
    responder: AgentActor;
    options: VellumPairOptions;
  }) => Promise<{ channelId: string; sessionId: string }>;
};

function isTerminal(chain: EconomyChainRecord): boolean {
  return (
    chain.status === "completed" ||
    chain.status === "failed" ||
    chain.negotiationOutcome !== undefined
  );
}

export function createEconomyNegotiateRuntime(
  input: CreateEconomyNegotiateRuntimeInput,
): EconomyNegotiateRuntime {
  const sessions = input.sessions ?? createVellumChainSessionRegistry();
  const chains = new Map<string, EconomyChainRecord>();
  const waiters = new Map<
    string,
    Array<{
      resolve: (chain: EconomyChainRecord) => void;
      reject: (err: Error) => void;
    }>
  >();

  const notifyWaiters = (chainId: string) => {
    const chain = chains.get(chainId);
    if (chain === undefined || !isTerminal(chain)) return;
    const pending = waiters.get(chainId) ?? [];
    waiters.delete(chainId);
    for (const waiter of pending) waiter.resolve(chain);
  };

  const rejectWaiters = (err: Error) => {
    for (const [chainId, pending] of waiters) {
      waiters.delete(chainId);
      for (const waiter of pending) waiter.reject(err);
    }
  };

  const applyStatus = (chainId: string, patch: NbcLoopStatusPatch): void => {
    const existing = chains.get(chainId);
    if (existing === undefined) return;
    const next: EconomyChainRecord = { ...existing };
    if (patch.status === "running" || patch.status === "waiting-peer") {
      next.status = "open";
    } else if (patch.status === "completed") {
      next.status = "completed";
    } else if (patch.status === "failed") {
      next.status = "failed";
    }
    if (patch.outcome !== undefined) {
      next.negotiationOutcome = patch.outcome;
    }
    chains.set(chainId, next);
    notifyWaiters(chainId);
  };

  const host: NbcLoopHost = {
    getChain: (chainId) => {
      const chain = chains.get(chainId);
      if (chain === undefined) return null;
      const {
        encounterId: _e,
        chainId: _c,
        vellumSessionId: _v,
        relationshipRef: _r,
        ...view
      } = chain;
      return view;
    },
    localDids: () => input.localDids,
    onStatus: applyStatus,
    startTurn: async (turnInput) => {
      if (input.startTurn === undefined) {
        throw new Error(
          "EconomyNegotiateRuntime startTurn is not configured (provide startTurn or a host Workflow)",
        );
      }
      const result = await input.startTurn(turnInput);
      const existing = chains.get(turnInput.chainId);
      if (existing !== undefined) {
        chains.set(turnInput.chainId, {
          ...existing,
          turnsCompleted: Math.max(existing.turnsCompleted, turnInput.turnIndex + 1),
        });
      }
      return result;
    },
  };

  let loop: NbcLoopHandle | undefined = startNbcLoop({ sessions, host });

  const runtime: EconomyNegotiateRuntime = {
    sessions,
    getChain: (chainId) => chains.get(chainId) ?? null,
    listChains: () => [...chains.values()],
    onStatus: applyStatus,
    localDids: host.localDids,
    startTurn: host.startTurn,
    waitForTerminal: async (chainId, opts) => {
      const existing = chains.get(chainId);
      if (existing !== undefined && isTerminal(existing)) return existing;
      const timeoutMs = opts?.timeoutMs ?? 30_000;
      return new Promise<EconomyChainRecord>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(chainId);
          reject(new Error(`timed out waiting for chain ${chainId}`));
        }, timeoutMs);
        const list = waiters.get(chainId) ?? [];
        list.push({
          resolve: (chain) => {
            clearTimeout(timer);
            resolve(chain);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
        waiters.set(chainId, list);
      });
    },
    openAndRunEncounter: async (args) => {
      const chainId = args.encounter.chainId ?? `econ-${args.encounter.id}`;
      const opened =
        input.openChain !== undefined
          ? await input.openChain({
              chainId,
              initiator: args.initiator,
              responder: args.responder,
              options: args.vellumOptions,
            })
          : await sessions.open({
              chainId,
              initiator: args.initiator,
              responder: args.responder,
              options: args.vellumOptions,
            });

      const record: EconomyChainRecord = {
        chainId,
        encounterId: args.encounter.id,
        channelId: opened.channelId,
        status: "open",
        initiatorDid: args.initiator.did,
        counterpartyDid: args.responder.did,
        turnsCompleted: 0,
        maxTurns: args.maxTurns ?? 8,
        vellumSessionId: opened.sessionId,
        relationshipRef: opened.sessionId,
        ...(args.objective !== undefined ? { objective: args.objective } : {}),
        ...(args.constraints !== undefined ? { constraints: args.constraints } : {}),
      };
      chains.set(chainId, record);

      if (input.openChain !== undefined) {
        // Test/integration path: drive one local turn then terminal status.
        await host.startTurn({
          chainId,
          asDid: args.initiator.did,
          peerDid: args.responder.did,
          initiatorDid: args.initiator.did,
          turnIndex: 0,
          maxTurns: record.maxTurns,
          ...(args.objective !== undefined ? { objective: args.objective } : {}),
          ...(args.constraints !== undefined ? { constraints: args.constraints } : {}),
        });
        const afterTurn = chains.get(chainId);
        if (afterTurn === undefined || !isTerminal(afterTurn)) {
          applyStatus(chainId, { status: "completed", outcome: "bound" });
        }
      } else {
        loop?.notify({ chainId, turnSeq: 0, cause: "opened" });
      }

      const terminal = await runtime.waitForTerminal(chainId);
      return {
        chainId,
        channelId: opened.channelId,
        vellumSessionId: opened.sessionId,
        turnsCompleted: terminal.turnsCompleted,
        ...(terminal.negotiationOutcome != null
          ? { terminalOutcome: terminal.negotiationOutcome }
          : {}),
        status:
          terminal.status === "failed" || terminal.negotiationOutcome === "error"
            ? "failed"
            : "completed",
        ...(terminal.relationshipRef !== undefined
          ? { relationshipRef: terminal.relationshipRef }
          : {}),
      };
    },
    stop: () => {
      loop?.stop();
      loop = undefined;
      rejectWaiters(new Error("economy negotiate runtime stopped"));
      for (const chainId of chains.keys()) {
        try {
          sessions.disconnect(chainId);
        } catch {
          // best-effort cleanup
        }
      }
      chains.clear();
    },
  };

  return runtime;
}

export function createEconomyNbcEncounterRunner(input: {
  getRuntime: () => EconomyNegotiateRuntime | undefined;
  resolveActors: (
    initiatorDid: string,
    counterpartyDid: string,
  ) => { initiator: AgentActor; responder: AgentActor };
  vellumOptions: VellumPairOptions;
  maxTurns?: number;
  resolveBrief?: (scheduled: EconomyScheduledEncounter) => {
    objective?: string;
    constraints?: string;
  };
}): EconomyEncounterRunner {
  return async ({ encounter, scheduled }) => {
    const runtime = input.getRuntime();
    if (runtime === undefined) {
      throw new Error("economy negotiate runtime is not attached");
    }
    const { initiator, responder } = input.resolveActors(
      encounter.initiatorDid,
      encounter.counterpartyDid,
    );
    const brief = input.resolveBrief?.(scheduled) ?? {};
    const result = await runtime.openAndRunEncounter({
      encounter,
      scheduled,
      initiator,
      responder,
      vellumOptions: input.vellumOptions,
      maxTurns: input.maxTurns,
      ...brief,
    });
    return {
      chainId: result.chainId,
      turnsCompleted: result.turnsCompleted,
      tokensUsed: 0,
      terminalOutcome: result.terminalOutcome,
      status: result.status,
    };
  };
}

export function attachEconomyNegotiateRuntime(
  session: { negotiate?: EconomyNegotiateRuntime },
  runtime: EconomyNegotiateRuntime,
): void {
  session.negotiate = runtime;
}
