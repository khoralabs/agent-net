import { afterEach, describe, expect, test } from "bun:test";
import { openingTurnSchema } from "@khoralabs/obp-nbc";
import type { ChainSnapshot } from "@khoralabs/vellum-client";

import { createNbcChainChangeBus } from "./nbc-chain-change-bus.ts";
import { startNbcReplicaWatch } from "./nbc-replica-watch.ts";

function emptyGraph() {
  return {
    parties: [] as const,
    offers: [] as const,
    ports: [] as const,
    extends: [] as const,
    exposes: [] as const,
    binds: [] as const,
  };
}

function snap(offers: number, who: string | null): ChainSnapshot {
  return {
    session_id: "sess",
    graph: {
      ...emptyGraph(),
      offers: Array.from({ length: offers }, (_, i) => ({
        id: `o${i}`,
        type: "service.slot",
        expires_turn: 10,
        expires_at_ms: 0,
        partyId: "did:key:alice",
      })),
    },
    whoShouldAct: who,
    portsICanBind: [],
    needsTurn: who !== null,
    schema: openingTurnSchema,
  };
}

const live = {
  chainId: "c1",
  channelId: "ch",
  sessionId: "sess",
  initiatorDid: "did:key:alice",
  counterpartyDid: "did:key:bob",
  dataDirRoot: "/tmp",
  genesisComplete: true,
};

describe("startNbcReplicaWatch", () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  test("uses the locally bound DID when only the counterparty is on host", async () => {
    const published: number[] = [];
    const bus = createNbcChainChangeBus();
    bus.subscribe((e) => {
      if (e.chainId === "c1") published.push(e.turnSeq);
    });
    let snapshots = 0;
    const client = {
      getSessionSnapshot: async () => {
        snapshots += 1;
        if (snapshots === 1) return snap(0, "did:key:alice");
        return snap(1, "did:key:bob");
      },
    };
    stop = startNbcReplicaWatch({
      discoverMs: 20,
      bus,
      sessions: {
        list: () => [live],
        pool: () =>
          ({
            handle: (ref: { did: string }) => {
              if (ref.did !== "did:key:bob") throw new Error("not bound");
              return client;
            },
          }) as never,
      } as never,
    });
    await Bun.sleep(120);
    expect(published.length).toBeGreaterThan(0);
    expect(published[0]).toBe(1);
  });

  test("restarts turn streaming after a transient snapshot failure", async () => {
    const published: number[] = [];
    const bus = createNbcChainChangeBus();
    bus.subscribe((e) => {
      if (e.chainId === "c1") published.push(e.turnSeq);
    });
    let snapshots = 0;
    const client = {
      getSessionSnapshot: async () => {
        snapshots += 1;
        if (snapshots === 1) throw new Error("transient");
        if (snapshots === 2) return snap(0, "did:key:alice");
        return snap(1, "did:key:bob");
      },
    };
    stop = startNbcReplicaWatch({
      discoverMs: 20,
      bus,
      sessions: {
        list: () => [live],
        pool: () =>
          ({
            handle: () => client,
          }) as never,
      } as never,
    });
    await Bun.sleep(200);
    expect(published.length).toBeGreaterThan(0);
    expect(published[0]).toBe(1);
  });
});
