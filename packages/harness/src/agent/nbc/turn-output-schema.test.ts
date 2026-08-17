import { describe, expect, test } from "bun:test";

import {
  negotiationTurnEnvelopeSchema,
  parseNegotiationTurnEnvelope,
} from "./turn-output-schema.ts";
import type { AvailablePeerPort } from "./who-should-act.ts";

function port(id: string, bind_policy: Record<string, unknown> | null = null): AvailablePeerPort {
  return { id, type: "slot", promise: "open", partyId: "did:key:bob", bind_policy };
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
  test("opening turn requires expose with kind and promise", () => {
    const schema = negotiationTurnEnvelopeSchema(opening);
    expect(schema.safeParse({ expose: [{ kind: "slot", promise: "open" }] }).success).toBe(true);
    expect(schema.safeParse({ expose: [{}] }).success).toBe(false);
    expect(schema.safeParse({ expose: [{ type: "object", properties: {} }] }).success).toBe(false);
    expect(schema.safeParse({ disconnect: true }).success).toBe(false);
  });

  test("later turn with peer ports is disconnect or bind+expose", () => {
    const schema = negotiationTurnEnvelopeSchema(later);
    expect(schema.safeParse({ disconnect: true }).success).toBe(true);
    expect(
      schema.safeParse({
        bind: { pb: { amount: 3 } },
        expose: [{ kind: "slot", promise: "next" }],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        bind: { pb: {} },
        expose: [],
      }).success,
    ).toBe(false);
  });

  test("later turn with no bindable ports is disconnect or expose", () => {
    const schema = negotiationTurnEnvelopeSchema({ opening: false, peerPorts: [] });
    expect(schema.safeParse({ disconnect: true }).success).toBe(true);
    expect(schema.safeParse({ expose: [] }).success).toBe(true);
  });

  test("later turn against a port with no bind_policy requires empty payload", () => {
    const schema = negotiationTurnEnvelopeSchema({
      opening: false,
      peerPorts: [port("pa")],
    });
    expect(
      schema.safeParse({
        bind: { pa: {} },
        expose: [{ kind: "slot", promise: "next" }],
      }).success,
    ).toBe(true);
    const coerced = schema.safeParse({
      bind: { pa: { invented: true } },
      expose: [{ kind: "slot", promise: "next" }],
    });
    expect(coerced.success).toBe(true);
    if (!coerced.success) return;
    expect(coerced.data).toEqual({
      bind: { pa: {} },
      expose: [{ kind: "slot", promise: "next" }],
    });
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

  test("maps affordance type onto kind when it is not a JSON Schema keyword", () => {
    const parsed = parseNegotiationTurnEnvelope(
      { expose: [{ type: "slot", promise: "open" }] },
      opening,
    );
    expect(parsed).toEqual({ expose: [{ kind: "slot", promise: "open" }] });
  });

  test("maps ports alias onto expose", () => {
    const parsed = parseNegotiationTurnEnvelope(
      { ports: [{ kind: "slot", promise: "open" }] },
      opening,
    );
    expect(parsed).toEqual({ expose: [{ kind: "slot", promise: "open" }] });
  });

  test("rejects JSON Schema document as expose item", () => {
    expect(() =>
      parseNegotiationTurnEnvelope({ expose: [{ type: "object", properties: {} }] }, opening),
    ).toThrow();
  });

  test("rejects opening disconnect", () => {
    expect(() => parseNegotiationTurnEnvelope({ disconnect: true }, opening)).toThrow(
      /cannot disconnect/,
    );
  });

  test("accepts later bind+expose", () => {
    const parsed = parseNegotiationTurnEnvelope(
      { bind: { pb: { amount: 1 } }, expose: [{ kind: "slot", promise: "next" }] },
      later,
    );
    expect(parsed).toEqual({
      bind: { pb: { amount: 1 } },
      expose: [{ kind: "slot", promise: "next" }],
    });
  });
});
