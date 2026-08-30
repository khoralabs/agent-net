/**
 * Wakes local model turns from Vellum session snapshots + host chain index.
 */
import type { ChainSnapshot } from "@khoralabs/vellum-client";

import type { VellumChainSessionRegistry } from "../vellum-sessions.ts";
import type { NbcLoopHost } from "./loop-host.ts";
import type { NbcChainChanged } from "./nbc-chain-change-bus.ts";
import { whoShouldAct } from "./who-should-act.ts";

export type NbcWakeDispatcherDeps = {
  sessions: VellumChainSessionRegistry;
  host: NbcLoopHost;
  getSnapshot?: (input: { chainId: string; asDid: string }) => Promise<ChainSnapshot>;
};

const inFlight = new Set<string>();
const completed = new Set<string>();
const chainTails = new Map<string, Promise<void>>();

function dedupeKey(chainId: string, asDid: string, offers: number): string {
  return `${chainId}\0${asDid}\0${offers}`;
}

export function createNbcWakeDispatcher(deps: NbcWakeDispatcherDeps) {
  async function snapshotFor(chainId: string, asDid: string): Promise<ChainSnapshot | null> {
    if (deps.getSnapshot !== undefined) {
      return deps.getSnapshot({ chainId, asDid });
    }
    const live = deps.sessions.get(chainId);
    if (live === null || live.sessionId.length === 0) return null;
    const handle = deps.sessions.handleForDid(
      chainId,
      live.initiatorDid,
      live.counterpartyDid,
      asDid,
    );
    if (handle === null) return null;
    try {
      return await handle.getSessionSnapshot(live.sessionId);
    } catch {
      return null;
    }
  }

  async function dispatch(event: NbcChainChanged): Promise<void> {
    const chain = deps.host.getChain(event.chainId);
    if (chain === null) return;
    const live = deps.sessions.get(event.chainId);
    if (live === null) return;

    const local = new Set(deps.host.localDids());
    const candidates = [chain.initiatorDid, chain.counterpartyDid].filter((did) => local.has(did));

    for (const asDid of candidates) {
      const snap = await snapshotFor(event.chainId, asDid);
      if (snap === null) continue;
      const act = whoShouldAct(snap.graph, {
        status: chain.status,
        initiatorDid: chain.initiatorDid,
        counterpartyDid: chain.counterpartyDid,
        turnsCompleted: chain.turnsCompleted,
        maxTurns: chain.maxTurns,
        negotiationOutcome: chain.negotiationOutcome ?? null,
      });
      if (act.did === null) {
        if (
          act.reason === "terminal-bind" ||
          act.reason === "turn-limit" ||
          act.reason === "left" ||
          act.reason === "not-open"
        ) {
          const outcome =
            act.reason === "terminal-bind"
              ? "bound"
              : act.reason === "turn-limit"
                ? "turn-limit"
                : act.reason === "left"
                  ? "left"
                  : undefined;
          deps.host.onStatus(event.chainId, {
            status: "completed",
            ...(outcome !== undefined ? { outcome } : {}),
          });
        }
        continue;
      }
      if (!local.has(act.did)) {
        deps.host.onStatus(event.chainId, { status: "waiting-peer" });
        continue;
      }
      if (act.did !== asDid) continue;

      const turnIndex = snap.graph.offers.length;
      const key = dedupeKey(event.chainId, act.did, turnIndex);
      if (inFlight.has(key) || completed.has(key)) continue;
      inFlight.add(key);
      deps.host.onStatus(event.chainId, { status: "running" });
      const peerDid = act.did === chain.initiatorDid ? chain.counterpartyDid : chain.initiatorDid;
      try {
        const started = await deps.host.startTurn({
          chainId: event.chainId,
          asDid: act.did,
          peerDid,
          initiatorDid: chain.initiatorDid,
          turnIndex,
          maxTurns: chain.maxTurns,
          ...(act.did === chain.initiatorDid && chain.objective !== undefined
            ? { objective: chain.objective }
            : {}),
          ...(act.did === chain.initiatorDid && chain.constraints !== undefined
            ? { constraints: chain.constraints }
            : {}),
        });
        if (started?.runId !== undefined) {
          deps.host.onStatus(event.chainId, { runId: started.runId });
        }
        completed.add(key);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.host.onStatus(event.chainId, {
          status: "failed",
          outcome: "error",
          detail: message.slice(0, 500),
        });
      } finally {
        inFlight.delete(key);
      }
    }
  }

  return function onChainChanged(event: NbcChainChanged): Promise<void> {
    const prev = chainTails.get(event.chainId) ?? Promise.resolve();
    const next = prev.then(
      () => dispatch(event),
      () => dispatch(event),
    );
    chainTails.set(event.chainId, next);
    return next;
  };
}

export function resetNbcWakeDispatcherForTests(): void {
  inFlight.clear();
  completed.clear();
  chainTails.clear();
}
