/**
 * Polls bound Vellum replicas for graph changes and publishes `snapshot` wake events.
 *
 * **Temporary** — delete this module when Vellum exposes a push subscription
 * (e.g. graph-advanced / your-turn). {@link startNbcLoop} should then swap
 * `startNbcReplicaWatch` for that subscription in one place.
 */
import type { VellumChainSessionRegistry } from "../../lib/vellum-sessions.ts";
import type { NbcChainChangeBus } from "./nbc-chain-change-bus.ts";

const POLL_MS = 800;

/** Poll bound replicas and publish snapshot wakes when graphSummary advances. */
export function startNbcReplicaWatch(input: {
  sessions: VellumChainSessionRegistry;
  bus: NbcChainChangeBus;
}): () => void {
  const lastHash = new Map<string, string>();
  const timer = setInterval(() => {
    void poll(input, lastHash);
  }, POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function poll(
  input: {
    sessions: VellumChainSessionRegistry;
    bus: NbcChainChangeBus;
  },
  lastHash: Map<string, string>,
): Promise<void> {
  for (const live of input.sessions.list()) {
    for (const did of [live.initiatorDid, live.counterpartyDid]) {
      const handle = input.sessions.handleForDid(
        live.chainId,
        live.initiatorDid,
        live.counterpartyDid,
        did,
      );
      if (handle === null) continue;
      try {
        const snap = await handle.getChainSnapshot();
        const summary = snap.graphSummary;
        const hash = JSON.stringify(summary ?? snap.chains);
        const key = `${live.channelId}\0${did}`;
        const prev = lastHash.get(key);
        if (prev === hash) continue;
        lastHash.set(key, hash);
        if (prev === undefined) continue;
        const offers =
          summary !== null &&
          typeof summary === "object" &&
          "offers" in summary &&
          typeof (summary as { offers?: unknown }).offers === "number"
            ? (summary as { offers: number }).offers
            : 0;
        input.bus.publish({
          chainId: live.chainId,
          turnSeq: offers,
          cause: "snapshot",
        });
      } catch {
        /* replica not ready */
      }
    }
  }
}
