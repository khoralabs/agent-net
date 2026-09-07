import { afterEach, describe, expect, test } from "bun:test";
import { resetNbcWakeDispatcherForTests } from "../agent/social/negotiate/nbc/nbc-wake-dispatcher.ts";

import {
  createEconomyNbcEncounterRunner,
  createEconomyNegotiateRuntime,
} from "./encounter-registry.ts";
import type { EconomyEncounter } from "./types.ts";

afterEach(() => {
  resetNbcWakeDispatcherForTests();
});

const actor = (did: string) => ({ did, signer: {} as never, client: {} as never }) as never;

const encounter = (id: string, a: string, b: string): EconomyEncounter => ({
  id,
  sessionId: "s",
  roundIndex: 0,
  initiatorDid: a,
  counterpartyDid: b,
  status: "running",
  isRepeat: false,
  turnsCompleted: 0,
  tokensUsed: 0,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
});

const vellumOptions = {
  relayBaseUrl: "http://127.0.0.1:9",
  agentsDataDir: "/tmp",
  vellumDataDir: "/tmp",
};

describe("economy encounter registry", () => {
  test("concurrent chains track status and complete via mocked turns", async () => {
    const turns: string[] = [];
    const runtime = createEconomyNegotiateRuntime({
      localDids: ["did:key:a", "did:key:b", "did:key:c"],
      openChain: async ({ chainId }) => ({
        channelId: `ch-${chainId}`,
        sessionId: `vellum-${chainId}`,
      }),
      startTurn: async (input) => {
        turns.push(`${input.chainId}:${input.asDid}`);
        if (input.asDid === input.initiatorDid) {
          expect(input.objective).toBe("private-goal");
        } else {
          expect(input.objective).toBeUndefined();
        }
        runtime.onStatus(input.chainId, { status: "completed", outcome: "left" });
        return { runId: `run-${input.chainId}`, tokensUsed: 7 };
      },
    });

    const [r1, r2] = await Promise.all([
      runtime.openAndRunEncounter({
        encounter: encounter("e1", "did:key:a", "did:key:b"),
        scheduled: { initiatorDid: "did:key:a", counterpartyDid: "did:key:b" },
        initiator: actor("did:key:a"),
        responder: actor("did:key:b"),
        vellumOptions,
        objective: "private-goal",
      }),
      runtime.openAndRunEncounter({
        encounter: encounter("e2", "did:key:a", "did:key:c"),
        scheduled: { initiatorDid: "did:key:a", counterpartyDid: "did:key:c" },
        initiator: actor("did:key:a"),
        responder: actor("did:key:c"),
        vellumOptions,
        objective: "private-goal",
      }),
    ]);

    expect(r1.status).toBe("completed");
    expect(r2.status).toBe("completed");
    expect(r1.relationshipRef).toBe("relationship:did:key:a:did:key:b");
    expect(r1.tokensUsed).toBe(7);
    expect(turns.length).toBe(2);
    expect(runtime.listChains()).toHaveLength(2);

    const runner = createEconomyNbcEncounterRunner({
      getRuntime: () => runtime,
      resolveActors: (initiatorDid, counterpartyDid) => ({
        initiator: actor(initiatorDid),
        responder: actor(counterpartyDid),
      }),
      vellumOptions,
      resolveBrief: () => ({ objective: "private-goal" }),
    });

    const again = await runner({
      sessionId: "s",
      encounter: {
        ...encounter("e3", "did:key:b", "did:key:c"),
        isRepeat: true,
        priorEncounterId: "e1",
      },
      scheduled: { initiatorDid: "did:key:b", counterpartyDid: "did:key:c" },
    });
    expect(again.terminalOutcome).toBe("left");
    expect(again.chainId).toBe("econ-e3");
    expect(again.tokensUsed).toBe(7);

    runtime.stop();
    expect(runtime.listChains()).toHaveLength(0);
  });

  test("stop rejects pending waitForTerminal waiters", async () => {
    const runtime = createEconomyNegotiateRuntime({
      localDids: ["did:key:a"],
      openChain: async ({ chainId }) => ({
        channelId: `ch-${chainId}`,
        sessionId: `v-${chainId}`,
      }),
      startTurn: async () => ({ runId: "run" }),
    });
    const wait = runtime.waitForTerminal("pending-chain", { timeoutMs: 10_000 });
    runtime.stop();
    await expect(wait).rejects.toThrow(/stopped/);
  });

  test("error negotiation outcome resolves as failed", async () => {
    const runtime = createEconomyNegotiateRuntime({
      localDids: ["did:key:a", "did:key:b"],
      openChain: async ({ chainId }) => ({
        channelId: `ch-${chainId}`,
        sessionId: `vellum-${chainId}`,
      }),
      startTurn: async (input) => {
        runtime.onStatus(input.chainId, { status: "failed", outcome: "error" });
        return { runId: "run-err" };
      },
    });

    const out = await runtime.openAndRunEncounter({
      encounter: encounter("e-err", "did:key:a", "did:key:b"),
      scheduled: { initiatorDid: "did:key:a", counterpartyDid: "did:key:b" },
      initiator: actor("did:key:a"),
      responder: actor("did:key:b"),
      vellumOptions,
    });
    expect(out.status).toBe("failed");
    expect(out.terminalOutcome).toBe("error");
    runtime.stop();
  });
});
