import { afterEach, describe, expect, test } from "bun:test";
import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import { openingTurnSchema } from "@khoralabs/obp-nbc";
import type { ChainSnapshot } from "@khoralabs/vellum-client";

import type { NbcLoopChain } from "./loop-host.ts";
import { createNbcWakeDispatcher, resetNbcWakeDispatcherForTests } from "./nbc-wake-dispatcher.ts";

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

function snap(graph: NbcChainGraph, whoShouldAct: string | null): ChainSnapshot {
  return {
    session_id: "sess",
    graph,
    whoShouldAct,
    portsICanBind: [],
    needsTurn: whoShouldAct !== null,
    schema: openingTurnSchema,
  };
}

function loopChain(patch: Partial<NbcLoopChain> & Pick<NbcLoopChain, "channelId">): NbcLoopChain {
  return {
    status: "open",
    initiatorDid: "did:key:alice",
    counterpartyDid: "did:key:bob",
    turnsCompleted: 0,
    maxTurns: 6,
    ...patch,
  };
}

afterEach(() => {
  resetNbcWakeDispatcherForTests();
});

describe("nbc wake dispatcher", () => {
  test("wakes only the local whoShouldAct DID and ignores extra opened/snapshot seqs", async () => {
    const chain = loopChain({ channelId: "ch-1" });
    let runId = "";
    const starts: string[] = [];
    const onChanged = createNbcWakeDispatcher({
      sessions: {
        get: () => ({
          chainId: "c1",
          channelId: "ch-1",
          sessionId: "sess",
          initiatorDid: "did:key:alice",
          counterpartyDid: "did:key:bob",
        }),
      } as never,
      host: {
        getChain: (id) => (id === "c1" ? chain : null),
        onStatus: (_id, patch) => {
          if (patch.runId !== undefined) runId = patch.runId;
        },
        localDids: () => ["did:key:alice", "did:key:bob"],
        startTurn: async (input) => {
          starts.push(input.asDid);
          return { runId: `run-${input.asDid}` };
        },
      },
      getSnapshot: async () => snap(emptyGraph(), "did:key:alice"),
    });

    await onChanged({ chainId: "c1", turnSeq: 0, cause: "opened" });
    await onChanged({ chainId: "c1", turnSeq: 0, cause: "opened" });
    await onChanged({ chainId: "c1", turnSeq: 1, cause: "snapshot" });

    expect(starts).toEqual(["did:key:alice"]);
    expect(runId).toBe("run-did:key:alice");
  });

  test("non-local actor records waiting-peer and starts nothing", async () => {
    let status: string | undefined;
    const chain = loopChain({ channelId: "ch-1", turnsCompleted: 1 });
    const aliceGraph: NbcChainGraph = {
      ...emptyGraph(),
      parties: [
        { id: "did:key:alice", name: "alice" },
        { id: "did:key:bob", name: "bob" },
      ],
      offers: [
        {
          id: "o1",
          type: "service.slot",
          expires_turn: 10,
          expires_at_ms: 0,
          partyId: "did:key:alice",
        },
      ],
      exposes: [{ offerId: "o1", portId: "pa" }],
      ports: [
        {
          id: "pa",
          kind: "slot",
          promise: "open",
          ref: "",
          expires_turn: 10,
          expires_at_ms: 0,
          exposedOnOfferIds: ["o1"],
          bindCount: 0,
        },
      ],
    };
    const starts: string[] = [];
    const onChanged = createNbcWakeDispatcher({
      sessions: {
        get: () => ({
          chainId: "c2",
          channelId: "ch-1",
          sessionId: "sess",
          initiatorDid: "did:key:alice",
          counterpartyDid: "did:key:bob",
        }),
      } as never,
      host: {
        getChain: (id) => (id === "c2" ? chain : null),
        onStatus: (_id, patch) => {
          status = patch.status;
        },
        localDids: () => ["did:key:alice"],
        startTurn: async (input) => {
          starts.push(input.asDid);
          return { runId: "run" };
        },
      },
      getSnapshot: async () => snap(aliceGraph, "did:key:bob"),
    });

    await onChanged({ chainId: "c2", turnSeq: 1, cause: "turn" });
    expect(starts).toEqual([]);
    expect(status).toBe("waiting-peer");
  });

  test("passes initiator brief only when waking the initiator", async () => {
    const chain = loopChain({
      channelId: "ch-1",
      objective: "secret goal",
      constraints: "do not leak",
    });
    const bodies: Array<{
      asDid: string;
      objective?: string;
      constraints?: string;
    }> = [];
    const onChanged = createNbcWakeDispatcher({
      sessions: {
        get: () => ({
          chainId: "c3",
          channelId: "ch-1",
          sessionId: "sess",
          initiatorDid: "did:key:alice",
          counterpartyDid: "did:key:bob",
        }),
      } as never,
      host: {
        getChain: (id) => (id === "c3" ? chain : null),
        onStatus: () => undefined,
        localDids: () => ["did:key:alice"],
        startTurn: async (input) => {
          bodies.push({
            asDid: input.asDid,
            ...(input.objective !== undefined ? { objective: input.objective } : {}),
            ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          });
          return { runId: "run" };
        },
      },
      getSnapshot: async () => snap(emptyGraph(), "did:key:alice"),
    });

    await onChanged({ chainId: "c3", turnSeq: 0, cause: "opened" });
    expect(bodies).toEqual([
      {
        asDid: "did:key:alice",
        objective: "secret goal",
        constraints: "do not leak",
      },
    ]);
  });

  test("exhausted ports without binds marks failed/error", async () => {
    const chain = loopChain({ channelId: "ch-1", turnsCompleted: 1 });
    const exhausted: NbcChainGraph = {
      ...emptyGraph(),
      parties: [
        { id: "did:key:alice", name: "alice" },
        { id: "did:key:bob", name: "bob" },
      ],
      offers: [
        {
          id: "o1",
          type: "service.slot",
          expires_turn: 10,
          expires_at_ms: 0,
          partyId: "did:key:alice",
        },
      ],
      exposes: [{ offerId: "o1", portId: "pa" }],
      ports: [
        {
          id: "pa",
          kind: "slot",
          promise: "open",
          ref: "",
          expires_turn: 10,
          expires_at_ms: 0,
          exposedOnOfferIds: ["o1"],
          bindCount: 1,
          max_bindings: 1,
        },
      ],
    };
    let status: string | undefined;
    let outcome: string | undefined;
    const starts: string[] = [];
    const onChanged = createNbcWakeDispatcher({
      sessions: {
        get: () => ({
          chainId: "c4",
          channelId: "ch-1",
          sessionId: "sess",
          initiatorDid: "did:key:alice",
          counterpartyDid: "did:key:bob",
        }),
      } as never,
      host: {
        getChain: (id) => (id === "c4" ? chain : null),
        onStatus: (_id, patch) => {
          if (patch.status !== undefined) status = patch.status;
          if (patch.outcome !== undefined) outcome = patch.outcome;
        },
        localDids: () => ["did:key:alice", "did:key:bob"],
        startTurn: async (input) => {
          starts.push(input.asDid);
          return { runId: "run" };
        },
      },
      getSnapshot: async () => snap(exhausted, null),
    });

    await onChanged({ chainId: "c4", turnSeq: 1, cause: "snapshot" });
    expect(starts).toEqual([]);
    expect(status).toBe("failed");
    expect(outcome).toBe("error");
  });
});
