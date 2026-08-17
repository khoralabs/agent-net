/**
 * Derives model-turn context (opening, peer ports, remaining turns) from a replica graph.
 *
 * **Temporary** — wraps {@link availablePeerPorts} and empty-graph opening detection
 * until snapshot APIs replace local graph joins.
 */
import type { NbcChainGraph } from "../../lib/nbc-chain-graph.ts";
import { availablePeerPorts } from "./who-should-act.ts";

/** Derive opening flag, peer ports, and remaining turns from a replica graph. */
export function nbcTurnContext(input: {
  graph: NbcChainGraph;
  asDid: string;
  initiatorDid: string;
  maxTurns: number;
  turnsCompleted: number;
}) {
  return {
    peerPorts: availablePeerPorts(input.graph, input.asDid),
    opening: input.asDid === input.initiatorDid && input.graph.offers.length === 0,
    remainingTurns: Math.max(0, input.maxTurns - input.turnsCompleted),
  };
}
