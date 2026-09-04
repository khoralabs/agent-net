import { describe, expect, test } from "bun:test";

import type { AgentHandle } from "../../handle.ts";
import { openVellumChainForDids } from "./open-vellum-chain.ts";
import type { VellumPairOptions } from "./vellum.ts";
import type { VellumChainSessionRegistry } from "./vellum-sessions.ts";

const options: VellumPairOptions = {
  relayBaseUrl: "http://127.0.0.1:9999",
  agentsDataDir: "/tmp/agents",
  vellumDataDir: "/tmp/vellum",
};

function handleFor(did: string): AgentHandle {
  return { did } as AgentHandle;
}

describe("openVellumChainForDids", () => {
  test("focuses both parties and opens the chain between them", async () => {
    const focused: string[] = [];
    const openCalls: Array<Record<string, unknown>> = [];

    const opened = await openVellumChainForDids(
      {
        focus: async (did) => {
          focused.push(did);
          return handleFor(did);
        },
      },
      {
        open: (async (input) => {
          openCalls.push(input as unknown as Record<string, unknown>);
          return {
            channelId: "ch-1",
            sessionId: "s-1",
            live: {} as never,
          };
        }) as VellumChainSessionRegistry["open"],
      },
      {
        chainId: "c-1",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        options,
      },
    );

    expect(opened).toEqual({ channelId: "ch-1", sessionId: "s-1" });
    expect(focused).toEqual(["did:key:alice", "did:key:bob"]);
    expect(openCalls).toHaveLength(1);
    expect(openCalls[0]).toMatchObject({
      chainId: "c-1",
      options,
      initiator: { did: "did:key:alice" },
      responder: { did: "did:key:bob" },
    });
  });

  test("propagates focus failures without opening a session", async () => {
    let openedCount = 0;
    await expect(
      openVellumChainForDids(
        {
          focus: async (did) => {
            if (did === "did:key:bob") throw new Error("Agent did:key:bob is not managed");
            return handleFor(did);
          },
        },
        {
          open: (async () => {
            openedCount += 1;
            return { channelId: "ch", sessionId: "s", live: {} as never };
          }) as VellumChainSessionRegistry["open"],
        },
        {
          chainId: "c-1",
          initiatorDid: "did:key:alice",
          counterpartyDid: "did:key:bob",
          options,
        },
      ),
    ).rejects.toThrow(/not managed/);
    expect(openedCount).toBe(0);
  });
});
