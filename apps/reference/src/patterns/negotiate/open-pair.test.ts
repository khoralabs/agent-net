import { describe, expect, mock, test } from "bun:test";

import type { AgentActor, AgentHandle, VellumHandle } from "@khoralabs/agent-net-harness";

import { createNegotiatePairRegistry } from "./open-pair.ts";

function fakeHandle(id: string): VellumHandle {
  return { id } as unknown as VellumHandle;
}

describe("createNegotiatePairRegistry", () => {
  test("tracks pairs and clears on stopAll via disconnect", async () => {
    const disconnect = mock((..._handles: VellumHandle[]) => {});
    const initV = fakeHandle("init");
    const respV = fakeHandle("resp");
    const registry = createNegotiatePairRegistry({
      disconnect,
      start: async () => ({
        sessionId: "sess-1",
        channelId: "chan-1",
        initiatorVellum: initV,
        responderVellum: respV,
      }),
    });

    expect(registry.list()).toEqual([]);

    await registry.open(
      { did: "did:key:seller" } as AgentHandle,
      { did: "did:key:buyer" } as AgentActor,
      {
        relayBaseUrl: "http://relay",
        agentsDataDir: "/tmp/agents",
        vellumDataDir: "/tmp/vellum",
      },
    );

    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.sessionId).toBe("sess-1");

    registry.stopAll();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect.mock.calls[0]).toEqual([initV, respV]);
    expect(registry.list()).toHaveLength(0);

    registry.stopAll();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
