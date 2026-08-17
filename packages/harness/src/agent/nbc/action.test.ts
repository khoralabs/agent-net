import { describe, expect, test } from "bun:test";

import { negotiationOutputToWire } from "./action.ts";
import { buildNegotiationUserMessage } from "./prompt.ts";
import type { AvailablePeerPort } from "./who-should-act.ts";

const amountPolicy = {
  type: "object",
  additionalProperties: false,
  required: ["amount"],
  properties: { amount: { type: "number" } },
} as const;

const peer: AvailablePeerPort = {
  id: "pb",
  type: "slot",
  promise: "open",
  partyId: "did:key:bob",
  bind_policy: { ...amountPolicy },
};

describe("NBC prompt privacy", () => {
  test("counterparty message omits initiator brief", () => {
    const msg = buildNegotiationUserMessage({
      asDid: "did:key:bob",
      initiatorDid: "did:key:alice",
      brief: { objective: "SECRET_GOAL", constraints: "SECRET_LIMIT" },
      graphSummary: "offers=[]",
    });
    expect(msg).not.toContain("SECRET_GOAL");
    expect(msg).not.toContain("SECRET_LIMIT");
    expect(msg).not.toContain("Private objective");
  });

  test("initiator message includes brief", () => {
    const msg = buildNegotiationUserMessage({
      asDid: "did:key:alice",
      initiatorDid: "did:key:alice",
      brief: { objective: "SECRET_GOAL", constraints: "SECRET_LIMIT" },
      graphSummary: "offers=[]",
    });
    expect(msg).toContain("SECRET_GOAL");
    expect(msg).toContain("SECRET_LIMIT");
  });
});

describe("negotiationOutputToWire", () => {
  test("opening expose maps kind onto wire type", () => {
    const wired = negotiationOutputToWire({
      raw: { expose: [{ kind: "slot", promise: "open" }] },
      opening: true,
      remainingTurns: 4,
      peerPorts: [],
    });
    expect(wired.kind).toBe("offer");
    if (wired.kind !== "offer") return;
    expect(wired.body).toEqual(
      expect.objectContaining({
        bind_port_id: "",
        bind_payload: null,
      }),
    );
    expect((wired.body.offer as { type: string; expires_at_ms: number }).type).toBe("service.slot");
    expect((wired.body.offer as { expires_at_ms: number }).expires_at_ms).toBe(0);
    expect(Array.isArray(wired.body.ports)).toBe(true);
    const ports = wired.body.ports as Array<{
      type: string;
      promise: string;
      expires_at_ms: number;
    }>;
    expect(ports.length).toBe(1);
    expect(ports[0]?.type).toBe("slot");
    expect(ports[0]?.promise).toBe("open");
    expect(ports[0]?.expires_at_ms).toBe(0);
  });

  test("maps affordance type onto kind when it is not a JSON Schema keyword", () => {
    const wired = negotiationOutputToWire({
      raw: { expose: [{ type: "slot", promise: "open" }] },
      opening: true,
      remainingTurns: 4,
      peerPorts: [],
    });
    expect(wired.kind).toBe("offer");
    if (wired.kind !== "offer") return;
    const ports = wired.body.ports as Array<{ type: string; promise: string }>;
    expect(ports[0]?.type).toBe("slot");
  });

  test("rejects missing kind and promise on expose ports", () => {
    expect(() =>
      negotiationOutputToWire({
        raw: { expose: [{}] },
        opening: true,
        remainingTurns: 4,
        peerPorts: [],
      }),
    ).toThrow();
  });

  test("bind+expose maps payload onto bind_port_id", () => {
    const wired = negotiationOutputToWire({
      raw: {
        bind: { pb: { amount: 3 } },
        expose: [{ kind: "slot", promise: "next" }],
      },
      opening: false,
      remainingTurns: 3,
      peerPorts: [peer],
    });
    expect(wired.kind).toBe("offer");
    if (wired.kind !== "offer") return;
    expect(wired.body.bind_port_id).toBe("pb");
    expect(wired.body.bind_payload).toEqual({ amount: 3 });
  });

  test("bind against a port with no bind_policy drops invented payload keys", () => {
    const openPeer: AvailablePeerPort = {
      id: "pa",
      type: "slot",
      promise: "open",
      partyId: "did:key:alice",
      bind_policy: null,
    };
    const wired = negotiationOutputToWire({
      raw: {
        bind: { pa: { rate: 100, invented: true } },
        expose: [{ kind: "slot", promise: "next" }],
      },
      opening: false,
      remainingTurns: 3,
      peerPorts: [openPeer],
    });
    expect(wired.kind).toBe("offer");
    if (wired.kind !== "offer") return;
    expect(wired.body.bind_port_id).toBe("pa");
    expect(wired.body.bind_payload).toEqual({});
  });

  test("disconnect maps to leave", () => {
    expect(
      negotiationOutputToWire({
        raw: { disconnect: true },
        opening: false,
        remainingTurns: 3,
        peerPorts: [peer],
      }),
    ).toEqual({ kind: "disconnect" });
  });

  test("rejects unknown bind port", () => {
    expect(() =>
      negotiationOutputToWire({
        raw: { bind: { nope: {} }, expose: [] },
        opening: false,
        remainingTurns: 3,
        peerPorts: [peer],
      }),
    ).toThrow(/not an available peer port/);
  });

  test("rejects extra bind keys", () => {
    expect(() =>
      negotiationOutputToWire({
        raw: { bind: { pb: { amount: 1 }, pa: {} }, expose: [] },
        opening: false,
        remainingTurns: 3,
        peerPorts: [peer],
      }),
    ).toThrow(/exactly one peer port/);
  });

  test("rejects opening disconnect", () => {
    expect(() =>
      negotiationOutputToWire({
        raw: { disconnect: true },
        opening: true,
        remainingTurns: 6,
        peerPorts: [],
      }),
    ).toThrow(/cannot disconnect/);
  });
});
