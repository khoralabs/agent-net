import { describe, expect, test } from "bun:test";

import type { NbcChainGraph } from "../../lib/nbc-chain-graph.ts";
import { availablePeerPorts, whoShouldAct } from "./who-should-act.ts";

function emptyGraph(): NbcChainGraph {
  return {
    parties: [],
    offers: [],
    ports: [],
    extends: [],
    exposes: [],
    binds: [],
  };
}

const chain = {
  status: "open",
  initiatorDid: "did:key:alice",
  counterpartyDid: "did:key:bob",
  turnsCompleted: 0,
  maxTurns: 6,
};

describe("whoShouldAct", () => {
  test("empty graph (pre-genesis) → initiator", () => {
    expect(whoShouldAct(emptyGraph(), chain)).toEqual({
      did: "did:key:alice",
      reason: "initiator-open",
    });
  });

  test("after genesis offer (initiator partyId) → counterparty", () => {
    const graph: NbcChainGraph = {
      ...emptyGraph(),
      offers: [
        {
          id: "o1",
          type: "service.slot",
          expires_turn: 10,
          expires_at_ms: 0,
          partyId: "did:key:alice",
        },
      ],
    };
    expect(whoShouldAct(graph, { ...chain, turnsCompleted: 1 })).toEqual({
      did: "did:key:bob",
      reason: "alternate",
    });
  });

  test("nobody when bound or turn-limit or not open", () => {
    const bound: NbcChainGraph = {
      ...emptyGraph(),
      binds: [{ offerId: "o1", portId: "p1", bind_payload: {} }],
    };
    expect(whoShouldAct(bound, chain).did).toBeNull();
    expect(whoShouldAct(emptyGraph(), { ...chain, turnsCompleted: 6 }).reason).toBe("turn-limit");
    expect(whoShouldAct(emptyGraph(), { ...chain, status: "closed" }).reason).toBe("not-open");
  });
});

describe("availablePeerPorts", () => {
  test("excludes own ports and filled binds", () => {
    const graph: NbcChainGraph = {
      parties: [],
      offers: [
        {
          id: "oa",
          type: "service.slot",
          expires_turn: 10,
          expires_at_ms: 0,
          partyId: "did:key:alice",
        },
        {
          id: "ob",
          type: "service.slot",
          expires_turn: 10,
          expires_at_ms: 0,
          partyId: "did:key:bob",
        },
      ],
      extends: [],
      exposes: [
        { offerId: "oa", portId: "pa" },
        { offerId: "ob", portId: "pb" },
      ],
      binds: [],
      ports: [
        {
          id: "pa",
          kind: "slot",
          promise: "open",
          ref: "",
          expires_turn: 10,
          expires_at_ms: 0,
          exposedOnOfferIds: ["oa"],
          bindCount: 0,
        },
        {
          id: "pb",
          kind: "slot",
          promise: "open",
          ref: "",
          expires_turn: 10,
          expires_at_ms: 0,
          exposedOnOfferIds: ["ob"],
          bindCount: 0,
          bind_policy: { type: "object", properties: { n: { type: "number" } } },
        },
      ],
    };
    const alicePeers = availablePeerPorts(graph, "did:key:alice");
    expect(alicePeers.map((p) => p.id)).toEqual(["pb"]);
    expect(alicePeers[0]?.bind_policy).toEqual({
      type: "object",
      properties: { n: { type: "number" } },
    });
    expect(availablePeerPorts(graph, "did:key:bob").map((p) => p.id)).toEqual(["pa"]);
    expect(availablePeerPorts(graph, "did:key:bob")[0]?.bind_policy).toBeNull();
  });
});
