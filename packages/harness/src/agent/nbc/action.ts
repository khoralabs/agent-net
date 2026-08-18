/**
 * Maps structured NBC model output onto OBP/Vellum wire turn bodies.
 *
 * **Temporary workarounds in this module:**
 * - LLM `kind` → wire `type` (JSON Schema `"type"` collision) until OBP/Vellum
 *   rename the port affordance field.
 * - `expires_at_ms: 0` on offers/ports so model latency does not expire ports;
 *   remove when upstream documents no wall-clock expiry for agent loops.
 * - Bind payload validation/coercion for no-`bind_policy` ports until official
 *   later-turn JSON Schema matches harness behavior.
 */
import type { JsonDocument } from "@khoralabs/obp-core";
import {
  type NbcPortSpec,
  type NbcTurnBody,
  serializeNbcTurnBodyForWire,
  validateBindPolicyAtExpose,
  validateNbcBindPayloadForPort,
} from "@khoralabs/obp-nbc";

import type { NegotiationPortDefinition, NegotiationTurnEnvelope } from "./turn-output-schema.ts";
import { parseNegotiationTurnEnvelope } from "./turn-output-schema.ts";
import type { AvailablePeerPort } from "./who-should-act.ts";

export type { NegotiationPortDefinition } from "./turn-output-schema.ts";

export type NegotiationTurnWire =
  | { kind: "disconnect" }
  | { kind: "offer"; body: Record<string, unknown> };

function asJsonDocument(value: Record<string, unknown> | null): JsonDocument {
  return value as JsonDocument;
}

function isDisconnectEnvelope(parsed: NegotiationTurnEnvelope): parsed is { disconnect: true } {
  return "disconnect" in parsed && parsed.disconnect === true;
}

/**
 * Map LLM-facing `kind` onto OBP/Vellum `NbcPortSpec.type`.
 *
 * TODO(nbc): Temporary host alias. Wire and OBP still use `type` until
 * `khora.obp.nbc` / Vellum rename the port affordance field to `kind`.
 * Do not read model `type` here — that collides with JSON Schema `"type"`.
 */
function toPortSpecs(
  expose: NegotiationPortDefinition[],
  expiresTurn: number,
  expiresAtMs: number,
  now: number,
): NbcPortSpec[] {
  return expose.map((p, i) => {
    const bindPolicy = p.bind_policy === undefined ? null : asJsonDocument(p.bind_policy);
    validateBindPolicyAtExpose(bindPolicy);
    const spec: NbcPortSpec = {
      id: `port-${i + 1}-${now.toString(36)}`,
      kind: p.kind,
      promise: p.promise,
      expires_turn: expiresTurn,
      expires_at_ms: expiresAtMs,
      bind_policy: bindPolicy,
      ref: p.ref?.trim() ?? "",
    };
    if (p.max_bindings !== undefined) spec.max_bindings = p.max_bindings;
    if (p.terminal !== undefined) spec.terminal = p.terminal;
    return spec;
  });
}

/** Map a structured generation result onto a Vellum leave or NBC turn body. */
export function negotiationOutputToWire(input: {
  raw: unknown;
  opening: boolean;
  remainingTurns: number;
  peerPorts: readonly AvailablePeerPort[];
}): NegotiationTurnWire {
  const parsed = parseNegotiationTurnEnvelope(input.raw, {
    opening: input.opening,
    peerPorts: input.peerPorts,
  });
  if (isDisconnectEnvelope(parsed)) {
    return { kind: "disconnect" };
  }

  const now = Date.now();
  const expiresTurn = Math.max(input.remainingTurns, 1) + 50;
  const expiresAtMs = 0;
  const ports = toPortSpecs(parsed.expose, expiresTurn, expiresAtMs, now);

  let bind_port_id = "";
  let bind_payload: NbcTurnBody["bind_payload"] = null;
  if (parsed.bind !== undefined) {
    const bindId = Object.keys(parsed.bind)[0] ?? "";
    const peer = input.peerPorts.find((p) => p.id === bindId);
    if (peer === undefined) {
      throw new Error(`bind port ${bindId} is not an available peer port`);
    }
    bind_port_id = bindId;
    bind_payload = asJsonDocument(
      validateNbcBindPayloadForPort(asJsonDocument(peer.bind_policy), parsed.bind[bindId]),
    );
  }

  const firstType = ports[0]?.kind.trim() ?? "";
  const body: NbcTurnBody = {
    offer: {
      id: `offer-${now.toString(36)}`,
      type: firstType.length > 0 ? `service.${firstType}` : "service.slot",
      expires_turn: expiresTurn,
      expires_at_ms: expiresAtMs,
    },
    ports,
    bind_port_id,
    bind_payload,
  };
  return { kind: "offer", body: serializeNbcTurnBodyForWire(body) };
}
