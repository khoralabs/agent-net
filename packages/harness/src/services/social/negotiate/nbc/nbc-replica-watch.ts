/**
 * Per-live-chain {@link VellumChain.turns} → snapshot wake events.
 */
import { VellumChain } from "@khoralabs/vellum-client";
import type { VellumPool } from "@khoralabs/vellum-client/pool";

import type { VellumChainLiveSession, VellumChainSessionRegistry } from "../vellum-sessions.ts";
import type { NbcChainChangeBus } from "./nbc-chain-change-bus.ts";

const DISCOVER_MS = 1000;

function localChain(pool: VellumPool, live: VellumChainLiveSession): VellumChain | null {
  for (const did of [live.initiatorDid, live.counterpartyDid]) {
    try {
      const peer = did === live.initiatorDid ? live.counterpartyDid : live.initiatorDid;
      return new VellumChain(pool.handle({ did, channelId: live.channelId }), live.sessionId, peer);
    } catch {
      /* this DID is not bound on this host */
    }
  }
  return null;
}

/** Watch bound replicas and publish snapshot wakes when the graph advances. */
export function startNbcReplicaWatch(input: {
  sessions: VellumChainSessionRegistry;
  bus: NbcChainChangeBus;
  discoverMs?: number;
}): () => void {
  const controllers = new Map<string, AbortController>();
  const finished = new Set<string>();

  function stopChain(chainId: string): void {
    const ac = controllers.get(chainId);
    if (ac !== undefined) {
      ac.abort();
      controllers.delete(chainId);
    }
    finished.delete(chainId);
  }

  function sync(): void {
    const lives = input.sessions.list();
    const ids = new Set(lives.map((l) => l.chainId));
    for (const id of controllers.keys()) {
      if (!ids.has(id)) stopChain(id);
    }
    for (const id of finished) {
      if (!ids.has(id)) finished.delete(id);
    }
    const pool = input.sessions.pool();
    if (pool === null) return;
    for (const live of lives) {
      if (
        live.sessionId.length === 0 ||
        controllers.has(live.chainId) ||
        finished.has(live.chainId)
      ) {
        continue;
      }
      const chain = localChain(pool, live);
      if (chain === null) continue;
      const ac = new AbortController();
      controllers.set(live.chainId, ac);
      void (async () => {
        let skipFirst = true;
        try {
          for await (const cue of chain.turns({ signal: ac.signal })) {
            if (skipFirst) {
              skipFirst = false;
              continue;
            }
            input.bus.publish({
              chainId: live.chainId,
              turnSeq: cue.snapshot.graph.offers.length,
              cause: "snapshot",
            });
          }
          if (!ac.signal.aborted) finished.add(live.chainId);
        } catch {
          /* transient — drop controller so the next sync can restart */
        } finally {
          controllers.delete(live.chainId);
        }
      })();
    }
  }

  sync();
  const timer = setInterval(sync, input.discoverMs ?? DISCOVER_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    for (const id of [...controllers.keys()]) stopChain(id);
  };
}
