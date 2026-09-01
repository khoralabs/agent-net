import { describe, expect, test } from "bun:test";

import {
  negotiationTurnEnvelopeSchema,
  parseNegotiationTurnEnvelope,
} from "./turn-output-schema.ts";
import type { AvailablePeerPort } from "./who-should-act.ts";

function port(id: string, bind_policy: Record<string, unknown> | null = null): AvailablePeerPort {
  return { id, type: "slot", promise: "open", partyId: "did:key:bob", bind_policy };
}

function ok(schema: ReturnType<typeof negotiationTurnEnvelopeSchema>, value: unknown): boolean {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) throw new Error("expected sync schema");
  return result.issues === undefined;
}

const opening = { opening: true, peerPorts: [] as AvailablePeerPort[] };
const amountPolicy = {
  type: "object",
  additionalProperties: false,
  required: ["amount"],
  properties: { amount: { type: "number" } },
};
const later = {
  opening: false,
  peerPorts: [port("pb", amountPolicy)],
};

describe("negotiationTurnEnvelopeSchema", () => {
  test("opening turn requires expose with kind and promise (or disconnect)", () => {
    const schema = negotiationTurnEnvelopeSchema(opening);
    expect(ok(schema, { expose: [{ kind: "slot", promise: "open" }] })).toBe(true);
    expect(ok(schema, { disconnect: true })).toBe(true);
    expect(ok(schema, { expose: [{}] })).toBe(false);
    expect(ok(schema, { expose: [{ type: "object", properties: {} }] })).toBe(false);
  });

  test("later turn with peer ports is disconnect or bind (+ optional expose)", () => {
    const schema = negotiationTurnEnvelopeSchema(later);
    expect(ok(schema, { disconnect: true })).toBe(true);
    expect(
      ok(schema, {
        bind: { portId: "pb", payload: { amount: 3 } },
        expose: [{ kind: "slot", promise: "next" }],
      }),
    ).toBe(true);
    expect(
      ok(schema, {
        bind: { portId: "pb", payload: {} },
        expose: [],
      }),
    ).toBe(false);
  });

  test("later turn with no bindable ports requires bind (or disconnect), not expose-only", () => {
    const schema = negotiationTurnEnvelopeSchema({ opening: false, peerPorts: [] });
    expect(ok(schema, { disconnect: true })).toBe(true);
    expect(ok(schema, { bind: { portId: "any", payload: {} } })).toBe(true);
    expect(ok(schema, { expose: [{ kind: "slot", promise: "wait" }] })).toBe(false);
  });

  test("later turn against a port with no bind_policy requires empty payload", () => {
    const schema = negotiationTurnEnvelopeSchema({
      opening: false,
      peerPorts: [port("pa")],
    });
    expect(
      ok(schema, {
        bind: { portId: "pa", payload: {} },
        expose: [{ kind: "slot", promise: "next" }],
      }),
    ).toBe(true);
    expect(
      ok(schema, {
        bind: { portId: "pa", payload: { invented: true } },
        expose: [{ kind: "slot", promise: "next" }],
      }),
    ).toBe(false);
  });
});

describe("parseNegotiationTurnEnvelope", () => {
  test("accepts opening expose with kind and promise", () => {
    expect(
      parseNegotiationTurnEnvelope({ expose: [{ kind: "slot", promise: "open" }] }, opening),
    ).toEqual({ expose: [{ kind: "slot", promise: "open" }] });
  });

  test("rejects empty expose item", () => {
    expect(() => parseNegotiationTurnEnvelope({ expose: [{}] }, opening)).toThrow();
  });

  test("rejects JSON Schema document as expose item", () => {
    expect(() =>
      parseNegotiationTurnEnvelope({ expose: [{ type: "object", properties: {} }] }, opening),
    ).toThrow();
  });

  test("accepts opening disconnect (leave ∪ opening)", () => {
    expect(parseNegotiationTurnEnvelope({ disconnect: true }, opening)).toEqual({
      disconnect: true,
    });
  });

  test("accepts later bind+expose", () => {
    const parsed = parseNegotiationTurnEnvelope(
      {
        bind: { portId: "pb", payload: { amount: 1 } },
        expose: [{ kind: "slot", promise: "next" }],
      },
      later,
    );
    expect(parsed).toEqual({
      bind: { portId: "pb", payload: { amount: 1 } },
      expose: [{ kind: "slot", promise: "next" }],
    });
  });
});
