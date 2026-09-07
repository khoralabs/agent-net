import { afterEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { installNetworkEventsPlugin, listNetworkEvents } from "@khoralabs/agent-net";
import {
  deferredEncounterRunner,
  resetEconomySessionsForTests,
  resetEconomyStateClientForTests,
  runEconomyUntilDone,
  setupEconomy,
  teardownEconomy,
} from "@khoralabs/agent-net/economy";
import { createSqliteNetworkEventPersistencePlugin } from "@khoralabs/agent-net/network-events/sqlite";

import {
  clearEconomyScenarioRegistryForTests,
  getEconomyScenario,
  listEconomyScenarios,
  registerEconomyScenario,
} from "./scenario-registry.ts";
import { registerSmokeEconomyScenario, smokeEconomyScenario } from "./smoke-scenario.ts";

afterEach(() => {
  clearEconomyScenarioRegistryForTests();
  resetEconomySessionsForTests();
  resetEconomyStateClientForTests();
});

function mockHarness(dids = ["did:key:a", "did:key:b"]) {
  let spawnIndex = 0;
  return {
    spawn: async () => {
      const did = dids[spawnIndex++] ?? `did:key:x-${spawnIndex}`;
      return {
        did,
        chat: { createThread: async () => ({ id: `${did}-self` }) },
      };
    },
    registerAgent: async ({ agent }: { agent: { did: string } }) => ({
      staticHash: `hash-${agent.did}`,
    }),
    bindNetworkSession: () => {},
    unbindNetworkSession: () => {},
    ensureAgentRegistered: async () => {},
    resolveAgentWorkflowDeps: async () => ({ memoriesClient: { kind: "mock" } }),
    signedChat: { client: {} },
    stop: () => {},
  };
}

describe("economy reference smoke", () => {
  test("scenario registry lists smoke scenario", () => {
    registerSmokeEconomyScenario();
    expect(listEconomyScenarios()).toContain("smoke-lifecycle");
    expect(getEconomyScenario("smoke-lifecycle").id).toBe(smokeEconomyScenario.id);
  });

  test("setup → round → teardown lifecycle with deferred encounters", async () => {
    registerSmokeEconomyScenario();
    const dataDir = path.join(os.tmpdir(), `econ-smoke-${process.pid}-${crypto.randomUUID()}`);
    installNetworkEventsPlugin(createSqliteNetworkEventPersistencePlugin({ dataDir }));
    const sessionId = "econ-smoke";
    const scenario = getEconomyScenario("smoke-lifecycle");

    await setupEconomy({
      harness: mockHarness() as never,
      config: {
        sessionId,
        dataDir,
        actorCount: 2,
        maxTokenBudget: 1000,
        maxRounds: 1,
        model: { id: "test" },
      },
      ontology: {} as never,
      scenario,
    });

    const result = await runEconomyUntilDone({
      sessionId,
      encounterRunner: deferredEncounterRunner,
    });
    expect(result.roundsCompleted).toBe(1);
    expect(result.encounterCount).toBe(0);

    await teardownEconomy(sessionId);
    const kinds = (await listNetworkEvents(sessionId)).map((e) => e.kind);
    expect(kinds).toContain("economy.setup.completed");
    expect(kinds).toContain("economy.round.completed");
    expect(kinds).toContain("economy.teardown");
  });

  test("registerEconomyScenario rejects unknown get", () => {
    registerEconomyScenario({
      id: "custom",
      scheduleEncounters: () => [],
      shouldTerminate: () => true,
    });
    expect(() => getEconomyScenario("missing")).toThrow(/not registered/);
  });
});
