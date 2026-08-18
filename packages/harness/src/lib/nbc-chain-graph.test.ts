import { describe, expect, test } from "bun:test";

import { createVellumChainSessionRegistry } from "./vellum-sessions.ts";

describe("createVellumChainSessionRegistry", () => {
  test("get/handleForDid/disconnect are no-ops when empty", () => {
    const registry = createVellumChainSessionRegistry();
    expect(registry.get("c1")).toBeNull();
    expect(registry.handleForDid("c1", "did:a", "did:b", "did:a")).toBeNull();
    expect(registry.dataDirForDid("c1", "did:a")).toBeNull();
    registry.disconnect("c1");
    registry.clearForTests();
  });

  test("initChain throws when the chain was not opened", async () => {
    const registry = createVellumChainSessionRegistry();
    await expect(registry.initChain("c1", { offer: {}, ports: [] })).rejects.toThrow(
      "no live session",
    );
    registry.clearForTests();
  });

  test("initChain posts genesis via sendTurn and does not chainCreate", async () => {
    const registry = createVellumChainSessionRegistry();
    const genesisTurn = {
      offer: { id: "", type: "service.slot", expires_turn: 10, expires_at_ms: 0 },
      ports: [{ id: "", kind: "slot", promise: "open" }],
      bind_port_id: "",
      bind_payload: null,
    };
    const sendCalls: unknown[] = [];
    registry.seedLiveForTests(
      {
        chainId: "c1",
        channelId: "ch-1",
        sessionId: "sess-open",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        dataDirRoot: "/tmp",
        genesisComplete: false,
      },
      {
        "did:key:alice": {
          sendTurn: async (sessionId: string, body: unknown) => {
            sendCalls.push({ sessionId, body });
          },
        } as never,
      },
    );

    const result = await registry.initChain("c1", genesisTurn);
    expect(result).toEqual({ sessionId: "sess-open" });
    expect(sendCalls).toEqual([{ sessionId: "sess-open", body: genesisTurn }]);
    expect(registry.get("c1")?.genesisComplete).toBe(true);
    await expect(registry.initChain("c1", genesisTurn)).rejects.toThrow("already initialized");
    registry.clearForTests();
  });

  test("commitTurn leave calls endOffers without sendTurn", async () => {
    const registry = createVellumChainSessionRegistry();
    const sendCalls: unknown[] = [];
    const endCalls: string[] = [];
    registry.seedLiveForTests(
      {
        chainId: "c-leave",
        channelId: "ch-leave",
        sessionId: "sess-leave",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        dataDirRoot: "/tmp",
        genesisComplete: true,
      },
      {
        "did:key:alice": {
          sendTurn: async (_s: string, body: unknown) => {
            sendCalls.push(body);
          },
          endOffers: async (sessionId: string) => {
            endCalls.push(sessionId);
          },
        } as never,
      },
    );

    const result = await registry.commitTurn("c-leave", {
      asDid: "did:key:alice",
      body: { disconnect: true },
    });
    expect(result).toEqual({ sessionId: "sess-leave", genesis: false });
    expect(sendCalls).toEqual([]);
    expect(endCalls).toEqual(["sess-leave"]);
    registry.clearForTests();
  });

  test("commitTurn uses initChain for genesis and sendTurn afterward", async () => {
    const registry = createVellumChainSessionRegistry();
    const genesis = { offer: {}, ports: [] };
    const sendCalls: unknown[] = [];
    registry.seedLiveForTests(
      {
        chainId: "c1",
        channelId: "ch-1",
        sessionId: "sess-1",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        dataDirRoot: "/tmp",
        genesisComplete: false,
      },
      {
        "did:key:alice": {
          sendTurn: async (_s: string, body: unknown) => {
            sendCalls.push(body);
          },
        } as never,
        "did:key:bob": {
          sendTurn: async (_s: string, body: unknown) => {
            sendCalls.push(body);
          },
        } as never,
      },
    );

    const first = await registry.commitTurn("c1", {
      asDid: "did:key:alice",
      body: genesis,
    });
    expect(first).toEqual({ sessionId: "sess-1", genesis: true });

    const second = await registry.commitTurn("c1", {
      asDid: "did:key:bob",
      body: { bind_port_id: "p1" },
    });
    expect(second).toEqual({ sessionId: "sess-1", genesis: false });
    expect(sendCalls).toEqual([genesis, { bind_port_id: "p1" }]);
    registry.clearForTests();
  });

  test("commitTurn rejects non-initiator genesis", async () => {
    const registry = createVellumChainSessionRegistry();
    registry.seedLiveForTests({
      chainId: "c2",
      channelId: "ch-2",
      sessionId: "sess-2",
      initiatorDid: "did:key:alice",
      counterpartyDid: "did:key:bob",
      dataDirRoot: "/tmp",
      genesisComplete: false,
    });
    await expect(
      registry.commitTurn("c2", {
        asDid: "did:key:bob",
        body: { offer: {}, ports: [] },
      }),
    ).rejects.toThrow(/Only the initiator can post genesis/);
    registry.clearForTests();
  });
});
