/**
 * NBC control loop: change bus + {@link startNbcReplicaWatch} + wake dispatcher.
 *
 * **Temporary** — the replica-watch half of this module is deleted when Vellum
 * offers a subscription for graph/turn advances; keep the host callback surface
 * ({@link NbcLoopHost}) if product still needs workflow wake + status patches.
 */
import type { NbcChainGraph } from "../../lib/nbc-chain-graph.ts";
import type { VellumChainSessionRegistry } from "../../lib/vellum-sessions.ts";
import type { NbcLoopHost } from "./loop-host.ts";
import {
  createNbcChainChangeBus,
  type NbcChainChangeBus,
  type NbcChainChanged,
} from "./nbc-chain-change-bus.ts";
import { startNbcReplicaWatch } from "./nbc-replica-watch.ts";
import { createNbcWakeDispatcher } from "./nbc-wake-dispatcher.ts";

export type StartNbcLoopInput = {
  sessions: VellumChainSessionRegistry;
  host: NbcLoopHost;
  loadGraph?: (input: { dataDir: string; channelId: string }) => Promise<NbcChainGraph>;
};

export type NbcLoopHandle = {
  bus: NbcChainChangeBus;
  notify(event: NbcChainChanged): void;
  stop(): void;
};

/** Start replica watch + wake dispatcher on a chain-change bus. */
export function startNbcLoop(input: StartNbcLoopInput): NbcLoopHandle {
  const bus = createNbcChainChangeBus();
  const onChanged = createNbcWakeDispatcher({
    sessions: input.sessions,
    host: input.host,
    loadGraph: input.loadGraph,
  });
  const unsub = bus.subscribe((event) => {
    void onChanged(event);
  });
  const stopWatch = startNbcReplicaWatch({ sessions: input.sessions, bus });
  return {
    bus,
    notify(event) {
      bus.publish(event);
    },
    stop() {
      unsub();
      stopWatch();
    },
  };
}
