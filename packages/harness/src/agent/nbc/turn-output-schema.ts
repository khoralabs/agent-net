/**
 * Zod structured-output schema for NBC model turns.
 *
 * **Temporary workarounds in this module:**
 * - Port affordance field is `kind` (not wire `type`) until OBP/Vellum rename.
 * - `coercePort` / `coerceEnvelope` map model `type` → `kind` and strip invented
 *   bind keys on ports with no `bind_policy` until official later-turn schema.
 */
import { z } from "zod";

import type { AvailablePeerPort } from "./who-should-act.ts";

export type NegotiationTurnEnvelopeContext = {
  opening: boolean;
  peerPorts: readonly AvailablePeerPort[];
};

/**
 * LLM-facing port definition. `kind` is the host alias for NBC wire `type`.
 *
 * TODO(nbc): Remove this alias when `@khoralabs/obp-nbc` `NbcPortSpec.type`
 * (and Vellum graph port rows) are renamed to `kind`. Until then, map
 * `kind` → `type` in `toPortSpecs` immediately before wire serialization.
 */
export type NegotiationPortDefinition = {
  kind: string;
  promise: string;
  bind_policy?: Record<string, unknown> | null;
  ref?: string;
  max_bindings?: number;
  terminal?: boolean;
};

export type NegotiationTurnEnvelope =
  | { disconnect: true }
  | {
      expose: NegotiationPortDefinition[];
      bind?: Record<string, Record<string, unknown>>;
    };

/** JSON Schema `type` keywords — never treat these as an NBC port affordance. */
const JSON_SCHEMA_TYPE_KEYWORDS = new Set([
  "object",
  "string",
  "number",
  "integer",
  "array",
  "boolean",
  "null",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Coerce common model mistakes onto the LLM-facing port shape.
 *
 * TODO(nbc): Maps affordance `type` → `kind` when `type` is not a JSON Schema
 * keyword (the `type`/`kind` collision). Drop when upstream renames `NbcPortSpec.type`.
 */
function coercePort(value: unknown): unknown {
  const rec = asRecord(value);
  if (rec === null) return value;
  const next: Record<string, unknown> = { ...rec };
  const kind = typeof next.kind === "string" ? next.kind.trim() : "";
  const type = typeof next.type === "string" ? next.type.trim() : "";
  if (kind.length === 0 && type.length > 0 && !JSON_SCHEMA_TYPE_KEYWORDS.has(type.toLowerCase())) {
    next.kind = type;
  }
  if (typeof next.bind_policy === "string") {
    try {
      const parsed: unknown = JSON.parse(next.bind_policy);
      next.bind_policy = asRecord(parsed);
    } catch {
      next.bind_policy = null;
    }
  } else if (
    next.bind_policy !== undefined &&
    next.bind_policy !== null &&
    asRecord(next.bind_policy) === null
  ) {
    next.bind_policy = null;
  }
  return next;
}

function policyIsActive(policy: Record<string, unknown> | null): policy is Record<string, unknown> {
  return policy !== null && Object.keys(policy).length > 0;
}

function coerceEnvelope(peerPorts: readonly AvailablePeerPort[]) {
  return (value: unknown): unknown => {
    const rec = asRecord(value);
    if (rec === null) return value;
    let next: Record<string, unknown> = rec;
    if (next.expose === undefined && Array.isArray(next.ports)) {
      next = { ...next, expose: next.ports };
    }
    const bind = asRecord(next.bind);
    if (bind === null) return next;
    const coerced: Record<string, unknown> = { ...bind };
    let changed = false;
    for (const port of peerPorts) {
      if (!(port.id in coerced) || policyIsActive(port.bind_policy)) continue;
      const payload = asRecord(coerced[port.id]);
      if (payload !== null && Object.keys(payload).length === 0) continue;
      coerced[port.id] = {};
      changed = true;
    }
    return changed ? { ...next, bind: coerced } : next;
  };
}

const zPortDefinition = z.preprocess(
  coercePort,
  z.object({
    kind: z.string().min(1).describe("NBC port affordance (e.g. slot)."),
    promise: z.string().min(1).describe("What this port promises if bound."),
    bind_policy: z
      .record(z.string(), z.any())
      .nullable()
      .optional()
      .describe(
        "JSON Schema object to expose requirements as a prerequisite for binding this port.",
      ),
  }),
);

function zUnion<T extends z.ZodType>(variants: T[]): T | z.ZodUnion<[T, T, ...T[]]> {
  const first = variants[0];
  const second = variants[1];
  if (first === undefined) {
    throw new Error("zUnion requires at least one variant");
  }
  if (second === undefined) {
    return first;
  }
  return z.union([first, second, ...variants.slice(2)] as [T, T, ...T[]]);
}

function zBindPayload(policy: Record<string, unknown> | null) {
  if (!policyIsActive(policy)) {
    return z.object({}).describe("Empty object — this port has no bind_policy.");
  }
  return z.fromJSONSchema(policy as Parameters<typeof z.fromJSONSchema>[0]);
}

function zBindObject(peerPorts: readonly AvailablePeerPort[]) {
  return zUnion(
    peerPorts.map((port) => z.strictObject({ [port.id]: zBindPayload(port.bind_policy) })),
  );
}

function zDisconnect() {
  return z.object({
    disconnect: z.literal(true).describe("Leave the chain without binding."),
  });
}

function zExposeOffer(minItems: number) {
  return z.object({
    expose: z.array(zPortDefinition).min(minItems),
  });
}

/**
 * Structured-output schema for this DID's legal NBC turn.
 *
 * TODO(nbc): Port affordance is `kind` here (not wire `type`) to avoid colliding
 * with the JSON Schema keyword `"type"`. Peer `bind_policy` documents become
 * Zod via `z.fromJSONSchema`; OBP still checks them at map time.
 */
export function negotiationTurnEnvelopeSchema(input: NegotiationTurnEnvelopeContext) {
  const coerce = coerceEnvelope(input.peerPorts);
  if (input.opening) {
    return z.preprocess(coerce, zExposeOffer(1));
  }
  if (input.peerPorts.length === 0) {
    return z.preprocess(coerce, zUnion([zDisconnect(), zExposeOffer(0)]));
  }
  return z.preprocess(
    coerce,
    zUnion([
      zDisconnect(),
      z.object({
        bind: zBindObject(input.peerPorts),
        expose: z.array(zPortDefinition),
      }),
    ]),
  );
}

function isDisconnectShape(value: unknown): boolean {
  return asRecord(value)?.disconnect === true;
}

function assertBindKeys(value: unknown, ctx: NegotiationTurnEnvelopeContext): void {
  if (ctx.opening || ctx.peerPorts.length === 0 || isDisconnectShape(value)) return;
  const bind = asRecord(value)?.bind;
  if (bind === undefined) return;
  const rec = asRecord(bind);
  if (rec === null) return;
  const keys = Object.keys(rec);
  if (keys.length !== 1) {
    throw new Error("bind must name exactly one peer port");
  }
  const id = keys[0] ?? "";
  if (!ctx.peerPorts.some((p) => p.id === id)) {
    throw new Error(`bind port ${id} is not an available peer port`);
  }
}

/** Parse and type-check a model turn object. Throws on invalid envelope. */
export function parseNegotiationTurnEnvelope(
  value: unknown,
  ctx: NegotiationTurnEnvelopeContext,
): NegotiationTurnEnvelope {
  if (ctx.opening && isDisconnectShape(value)) {
    throw new Error("initiator cannot disconnect on the opening turn");
  }
  assertBindKeys(value, ctx);
  return negotiationTurnEnvelopeSchema(ctx).parse(value) as NegotiationTurnEnvelope;
}
