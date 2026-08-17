/**
 * Pure turn-order and bindable-port helpers over a loaded {@link NbcChainGraph}.
 *
 * **Temporary** — {@link whoShouldAct} infers the next actor from last-offer
 * `partyId`; {@link availablePeerPorts} joins exposes/ports locally. Both are
 * superseded by Vellum/OBP snapshot APIs (`whoShouldAct`, `portsICanBind`).
 */
import type { NbcChainGraph } from "../../lib/nbc-chain-graph.ts";

export const NBC_DEFAULT_MAX_TURNS = 6;
export const NBC_MAX_TURNS_CAP = 10;

export type NegotiationChainView = {
  status: string;
  initiatorDid: string;
  counterpartyDid: string;
  turnsCompleted: number;
  maxTurns: number;
  negotiationOutcome?: string | null;
};

export type WhoShouldActResult = {
  did: string | null;
  reason:
    | "initiator-open"
    | "alternate"
    | "terminal-bind"
    | "left"
    | "turn-limit"
    | "not-open"
    | "error";
};

function otherParty(chain: NegotiationChainView, did: string): string {
  return did === chain.initiatorDid ? chain.counterpartyDid : chain.initiatorDid;
}

/** Pure: who should submit the next NBC action on this replica. */
export function whoShouldAct(
  graph: NbcChainGraph,
  chain: NegotiationChainView,
): WhoShouldActResult {
  if (chain.status !== "open") {
    return { did: null, reason: "not-open" };
  }
  if (chain.negotiationOutcome === "left") {
    return { did: null, reason: "left" };
  }
  if (chain.negotiationOutcome === "error") {
    return { did: null, reason: "error" };
  }
  if (chain.negotiationOutcome === "bound" || graph.binds.length > 0) {
    return { did: null, reason: "terminal-bind" };
  }
  if (chain.negotiationOutcome === "turn-limit" || chain.turnsCompleted >= chain.maxTurns) {
    return { did: null, reason: "turn-limit" };
  }
  if (graph.offers.length === 0) {
    return { did: chain.initiatorDid, reason: "initiator-open" };
  }
  const last = graph.offers[graph.offers.length - 1];
  if (last === undefined) {
    return { did: chain.initiatorDid, reason: "initiator-open" };
  }
  return { did: otherParty(chain, last.partyId), reason: "alternate" };
}

export type AvailablePeerPort = {
  id: string;
  type: string;
  promise: string;
  partyId: string;
  bind_policy: Record<string, unknown> | null;
};

function jsonObjectOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Peer ports this DID may bind on the current replica graph. */
export function availablePeerPorts(graph: NbcChainGraph, asDid: string): AvailablePeerPort[] {
  const ownOfferIds = new Set(graph.offers.filter((o) => o.partyId === asDid).map((o) => o.id));
  const peerPortIds = new Set<string>();
  for (const edge of graph.exposes) {
    if (!ownOfferIds.has(edge.offerId)) peerPortIds.add(edge.portId);
  }
  const out: AvailablePeerPort[] = [];
  for (const port of graph.ports) {
    if (!peerPortIds.has(port.id)) continue;
    if (port.expired === true || port.terminal === true) continue;
    const max = port.max_bindings ?? 1;
    if (port.bindCount >= max) continue;
    const offerId = graph.exposes.find((e) => e.portId === port.id)?.offerId;
    const partyId = graph.offers.find((o) => o.id === offerId)?.partyId ?? "";
    out.push({
      id: port.id,
      type: port.type,
      promise: port.promise,
      partyId,
      bind_policy: jsonObjectOrNull(port.bind_policy),
    });
  }
  return out;
}

export function clampMaxTurns(raw: unknown, fallback = NBC_DEFAULT_MAX_TURNS): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const n = Math.floor(raw);
  if (n < 1) return fallback;
  return Math.min(n, NBC_MAX_TURNS_CAP);
}
