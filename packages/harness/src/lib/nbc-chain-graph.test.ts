import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadNbcChainGraph } from "./nbc-chain-graph.ts";
import { createVellumChainSessionRegistry } from "./vellum-sessions.ts";

describe("loadNbcChainGraph", () => {
  test("throws when channel sqlite is missing", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "vellum-graph-"));
    await expect(loadNbcChainGraph({ dataDir, channelId: "missing-channel" })).rejects.toThrow();
  });
});

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

  test("initChain passes genesisTurn through chainCreate and does not default dummy genesis", async () => {
    const registry = createVellumChainSessionRegistry();
    const genesisTurn = {
      offer: { id: "", type: "service.slot", expires_turn: 10, expires_at_relay_ms: 0 },
      ports: [{ id: "", type: "slot", promise: "open" }],
      bind_port_id: "",
      bind_payload: null,
    };
    const chainCreates: unknown[] = [];
    registry.seedLiveForTests(
      {
        chainId: "c1",
        channelId: "ch-1",
        sessionId: "",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        dataDirRoot: "/tmp",
      },
      {
        "did:key:alice": {
          chainCreate: async (input: {
            counterpartyDid: string;
            genesisTurn?: Record<string, unknown>;
          }) => {
            chainCreates.push(input);
            return { ok: true as const, session_id: "sess-genesis" };
          },
        } as never,
      },
    );

    const result = await registry.initChain("c1", genesisTurn);
    expect(result).toEqual({ sessionId: "sess-genesis" });
    expect(chainCreates).toEqual([{ counterpartyDid: "did:key:bob", genesisTurn }]);
    expect(registry.get("c1")?.sessionId).toBe("sess-genesis");
    await expect(registry.initChain("c1", genesisTurn)).rejects.toThrow("already initialized");
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
        sessionId: "",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        dataDirRoot: "/tmp",
      },
      {
        "did:key:alice": {
          chainCreate: async () => ({ ok: true as const, session_id: "sess-1" }),
          sendTurn: async (_s: string, body: unknown) => {
            sendCalls.push(body);
          },
        } as never,
        "did:key:bob": {
          getChainSnapshot: async () => ({
            chains: [{ session_id: "sess-1" }],
          }),
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
    expect(sendCalls).toEqual([{ bind_port_id: "p1" }]);
    registry.clearForTests();
  });

  test("commitTurn rejects non-initiator genesis", async () => {
    const registry = createVellumChainSessionRegistry();
    registry.seedLiveForTests({
      chainId: "c2",
      channelId: "ch-2",
      sessionId: "",
      initiatorDid: "did:key:alice",
      counterpartyDid: "did:key:bob",
      dataDirRoot: "/tmp",
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
