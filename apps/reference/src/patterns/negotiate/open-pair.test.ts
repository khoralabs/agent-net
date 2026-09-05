import { describe, expect, mock, test } from "bun:test";

import type { AgentActor, AgentHandle } from "@khoralabs/agent-net";
import type { VellumHandle } from "@khoralabs/agent-net/negotiate";

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

  test("stop disconnects one pair and leaves others", async () => {
    const disconnect = mock((..._handles: VellumHandle[]) => {});
    let n = 0;
    const registry = createNegotiatePairRegistry({
      disconnect,
      start: async () => {
        n += 1;
        return {
          sessionId: `sess-${n}`,
          channelId: `chan-${n}`,
          initiatorVellum: fakeHandle(`init-${n}`),
          responderVellum: fakeHandle(`resp-${n}`),
        };
      },
    });

    const opts = {
      relayBaseUrl: "http://relay",
      agentsDataDir: "/tmp/agents",
      vellumDataDir: "/tmp/vellum",
    };
    const a = await registry.open(
      { did: "did:key:s1" } as AgentHandle,
      { did: "did:key:b" } as AgentActor,
      opts,
    );
    const b = await registry.open(
      { did: "did:key:s2" } as AgentHandle,
      { did: "did:key:b" } as AgentActor,
      opts,
    );
    expect(registry.list()).toHaveLength(2);

    registry.stop(a);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect.mock.calls[0]).toEqual([a.initiatorVellum, a.responderVellum]);
    expect(registry.list()).toEqual([b]);

    registry.stop(a);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
