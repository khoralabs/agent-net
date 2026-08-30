/**
 * Maps structured NBC model output onto OBP/Vellum wire turn bodies.
 */
import {
  hostTurnToNbcBody,
  isContinueTurn,
  isOpeningTurn,
  serializeNbcTurnBodyForWire,
} from "@khoralabs/obp-nbc";

import { isDisconnectEnvelope, parseNegotiationTurnEnvelope } from "./turn-output-schema.ts";
import type { AvailablePeerPort } from "./who-should-act.ts";

export type { NegotiationPortDefinition } from "./turn-output-schema.ts";

export type NegotiationTurnWire =
  | { kind: "disconnect" }
  | { kind: "offer"; body: Record<string, unknown> };

function offerTypeFor(body: { expose?: readonly { kind: string }[] }): string {
  const first = body.expose?.[0]?.kind.trim() ?? "";
  return first.length > 0 ? `service.${first}` : "service.slot";
}

/** Map a structured generation result onto a Vellum leave or NBC turn body. */
export function negotiationOutputToWire(input: {
  raw: unknown;
  opening: boolean;
  peerPorts: readonly AvailablePeerPort[];
}): NegotiationTurnWire {
  const parsed = parseNegotiationTurnEnvelope(input.raw, {
    opening: input.opening,
    peerPorts: input.peerPorts,
  });
  if (isDisconnectEnvelope(parsed)) {
    return { kind: "disconnect" };
  }
  if (!isOpeningTurn(parsed) && !isContinueTurn(parsed)) {
    throw new Error("expected opening or continue turn");
  }
  return {
    kind: "offer",
    body: serializeNbcTurnBodyForWire(hostTurnToNbcBody(parsed, offerTypeFor(parsed))),
  };
}
