/**
 * Wakes local model turns from chain-change events using a host chain index +
 * replica graph load + {@link whoShouldAct}.
 *
 * **Temporary** — shrink or remove when Vellum chain snapshots expose
 * `whoShouldAct(did)` and `portsICanBind(did)` so the dispatcher does not
 * poll sqlite or infer turn order from last-offer `partyId`. Dedupe of
 * `opened` + `snapshot` for the same turn goes away with a single `committed`
 * event from upstream.
 */
import { loadNbcChainGraph, type NbcChainGraph } from "../../lib/nbc-chain-graph.ts";
import type { VellumChainSessionRegistry } from "../../lib/vellum-sessions.ts";
import type { NbcLoopHost } from "./loop-host.ts";
import type { NbcChainChanged } from "./nbc-chain-change-bus.ts";
import { whoShouldAct } from "./who-should-act.ts";

export type NbcWakeDispatcherDeps = {
  sessions: VellumChainSessionRegistry;
  host: NbcLoopHost;
  loadGraph?: (input: { dataDir: string; channelId: string }) => Promise<NbcChainGraph>;
};

const inFlight = new Set<string>();
const completed = new Set<string>();
const chainTails = new Map<string, Promise<void>>();

function dedupeKey(chainId: string, asDid: string, offers: number): string {
  return `${chainId}\0${asDid}\0${offers}`;
}

export function createNbcWakeDispatcher(deps: NbcWakeDispatcherDeps) {
  async function dispatch(event: NbcChainChanged): Promise<void> {
    const chain = deps.host.getChain(event.chainId);
    if (chain === null) return;
    const live = deps.sessions.get(event.chainId);
    if (live === null) return;

    const local = new Set(deps.host.localDids());
    const candidates = [chain.initiatorDid, chain.counterpartyDid].filter((did) => local.has(did));

    for (const asDid of candidates) {
      const dataDir = deps.sessions.dataDirForDid(event.chainId, asDid);
      if (dataDir === null || chain.channelId.length === 0) continue;
      let graph: NbcChainGraph;
      try {
        graph = await (deps.loadGraph ?? loadNbcChainGraph)({
          dataDir,
          channelId: chain.channelId,
        });
      } catch {
        continue;
      }
      const act = whoShouldAct(graph, {
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

      const turnIndex = graph.offers.length;
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
