import { afterEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import { installNetworkEventsPlugin, listNetworkEvents } from "../index.ts";
import { createSqliteNetworkEventPersistencePlugin } from "../pool/network/persistence/sqlite/index.ts";

import { resetEconomyStateClientForTests } from "./economy-state.ts";
import { deferredEncounterRunner, runEconomyRound, runEconomyUntilDone } from "./run-round.ts";
import { getEconomySession, resetEconomySessionsForTests } from "./session-store.ts";
import { setupEconomy, teardownEconomy } from "./setup.ts";
import type { EconomyConfig, EconomyScenario } from "./types.ts";

function tmpDir(label: string): string {
  return path.join(os.tmpdir(), `economy-runtime-${label}-${process.pid}-${crypto.randomUUID()}`);
}

afterEach(() => {
  resetEconomySessionsForTests();
  resetEconomyStateClientForTests();
});

function mockHarness(dids = ["did:key:a", "did:key:b"]) {
  let spawnIndex = 0;
  const bound: string[] = [];
  return {
    spawn: async () => {
      const did = dids[spawnIndex++] ?? `did:key:extra-${spawnIndex}`;
      return {
        did,
        chat: {
          createThread: async () => ({ id: `${did}-self` }),
        },
      };
    },
    registerAgent: async ({ agent }: { agent: { did: string } }) => ({
      staticHash: `hash-${agent.did}`,
    }),
    bindNetworkSession: (input: { sessionId: string }) => {
      bound.push(input.sessionId);
    },
    unbindNetworkSession: (sessionId: string) => {
      const idx = bound.indexOf(sessionId);
      if (idx >= 0) bound.splice(idx, 1);
    },
    ensureAgentRegistered: async () => {},
    resolveAgentWorkflowDeps: async () => ({ memoriesClient: { kind: "mock" } }),
    signedChat: { client: {} },
    stop: () => {
      bound.length = 0;
    },
    _bound: bound,
  };
}

describe("economy runtime", () => {
  test("setup binds session, redacts private scenario state from events, teardown is idempotent", async () => {
    const dataDir = tmpDir("setup");
    installNetworkEventsPlugin(createSqliteNetworkEventPersistencePlugin({ dataDir }));

    const config: EconomyConfig = {
      sessionId: "econ-setup",
      dataDir,
      actorCount: 2,
      maxTokenBudget: 1000,
      maxRounds: 2,
      model: { id: "m" },
      actorLabels: ["buyer", "seller"],
    };

    const scenario: EconomyScenario = {
      id: "smoke",
      prepareActors: async ({ scenarioState }) => ({
        scenarioState: {
          ...(scenarioState as object),
          privateObjective: "NEVER_EMIT_THIS",
        },
      }),
      scheduleEncounters: () => [],
      shouldTerminate: () => true,
    };

    const harness = mockHarness() as never;
    const result = await setupEconomy({
      harness,
      config,
      ontology: {} as never,
      scenario,
      scenarioState: { seed: true },
    });

    expect(result.actors).toHaveLength(2);
    expect(result.actors[0]?.label).toBe("buyer");
    const live = getEconomySession(config.sessionId);
    expect((live.scenarioState as { privateObjective?: string }).privateObjective).toBe(
      "NEVER_EMIT_THIS",
    );

    const events = await listNetworkEvents(config.sessionId);
    const blob = JSON.stringify(events);
    expect(blob.includes("NEVER_EMIT_THIS")).toBe(false);
    expect(blob.includes("privateObjective")).toBe(false);
    expect(events.some((e) => e.kind === "economy.setup.completed")).toBe(true);

    await teardownEconomy(config.sessionId);
    expect(() => getEconomySession(config.sessionId)).toThrow(/not active/);
    await teardownEconomy(config.sessionId); // idempotent
  });

  test("runEconomyRound schedules encounters with first/repeat linkage and respects budgets", async () => {
    const dataDir = tmpDir("round");
    installNetworkEventsPlugin(createSqliteNetworkEventPersistencePlugin({ dataDir }));

    const config: EconomyConfig = {
      sessionId: "econ-round",
      dataDir,
      actorCount: 2,
      maxTokenBudget: 25,
      maxRounds: 3,
      model: { id: "m" },
    };

    let roundsSeen = 0;
    const scenario: EconomyScenario = {
      id: "pair",
      scheduleEncounters: ({ actors, roundIndex }) => {
        roundsSeen = roundIndex;
        const a = actors[0];
        const b = actors[1];
        if (a === undefined || b === undefined) return [];
        return [
          {
            initiatorDid: a.did,
            counterpartyDid: b.did,
            scenarioPayload: { secretBrief: "REDACT_ME" },
          },
        ];
      },
      shouldTerminate: ({ tokensUsed, maxTokenBudget }) => tokensUsed >= maxTokenBudget,
    };

    const harness = mockHarness() as never;
    await setupEconomy({
      harness,
      config,
      ontology: {} as never,
      scenario,
    });

    const first = await runEconomyRound({
      sessionId: config.sessionId,
      roundIndex: 0,
      encounterRunner: async () => ({
        status: "completed",
        terminalOutcome: "bound",
        turnsCompleted: 2,
        tokensUsed: 20,
        chainId: "chain-1",
      }),
    });
    expect(first.encounterIds).toHaveLength(1);
    expect(first.terminated).toBe(false);

    const second = await runEconomyRound({
      sessionId: config.sessionId,
      roundIndex: 1,
      encounterRunner: async ({ encounter }) => {
        expect(encounter.isRepeat).toBe(true);
        expect(encounter.priorEncounterId).toBe(first.encounterIds[0]);
        return {
          status: "completed",
          terminalOutcome: "bound",
          turnsCompleted: 1,
          tokensUsed: 10,
          chainId: "chain-2",
        };
      },
    });
    expect(second.terminated).toBe(true);
    expect(roundsSeen).toBe(1);

    const events = await listNetworkEvents(config.sessionId, {
      kind: "economy.encounter.started",
    });
    expect(JSON.stringify(events).includes("REDACT_ME")).toBe(false);
    expect(JSON.stringify(events).includes("secretBrief")).toBe(false);

    await teardownEconomy(config.sessionId);
  });

  test("runEconomyUntilDone stops at maxRounds with deferred runner", async () => {
    const dataDir = tmpDir("until");
    installNetworkEventsPlugin(createSqliteNetworkEventPersistencePlugin({ dataDir }));
    const config: EconomyConfig = {
      sessionId: "econ-until",
      dataDir,
      actorCount: 2,
      maxTokenBudget: 10_000,
      maxRounds: 2,
      model: { id: "m" },
    };
    const scenario: EconomyScenario = {
      id: "empty",
      scheduleEncounters: () => [],
      shouldTerminate: () => false,
    };
    await setupEconomy({
      harness: mockHarness() as never,
      config,
      ontology: {} as never,
      scenario,
    });
    const result = await runEconomyUntilDone({
      sessionId: config.sessionId,
      encounterRunner: deferredEncounterRunner,
    });
    expect(result.roundsCompleted).toBe(2);
    expect(result.encounterCount).toBe(0);
    await teardownEconomy(config.sessionId);
  });
});
