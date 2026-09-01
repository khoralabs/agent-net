import { expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import {
  checkTokenBudgetRemainingStep,
  createSwarmState,
  incrementTokensUsedStep,
  resetSwarmStateClientForTests,
} from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

test("parallel agent loops stop when shared budget is exhausted", async () => {
  resetSwarmStateClientForTests();
  const dataDir = path.join(os.tmpdir(), `agent-loop-${process.pid}-${crypto.randomUUID()}`);
  const config: SwarmConfig = {
    sessionId: "parallel-budget",
    dataDir,
    goal: "test",
    agentCount: 2,
    maxTokenBudget: 50,
    contextMessageLimit: 5,
    model: { id: "test", maxSteps: 1 },
    roles: ["a", "b"],
  };
  const agents: AgentLoopState[] = [
    {
      did: "did:key:a",
      agentId: "did:key:a",
      role: "a",
      selfThreadId: "a-self",
      registeredStaticHash: "h1",
      turnCount: 0,
    },
    {
      did: "did:key:b",
      agentId: "did:key:b",
      role: "b",
      selfThreadId: "b-self",
      registeredStaticHash: "h2",
      turnCount: 0,
    },
  ];

  const state = await createSwarmState(dataDir, config, agents);

  const loopResults = await Promise.all(
    agents.map(async () => {
      let turns = 0;
      while (await checkTokenBudgetRemainingStep(dataDir, state.id)) {
        await incrementTokensUsedStep(dataDir, state.id, 30);
        turns++;
      }
      return turns;
    }),
  );

  expect(loopResults.every((turns) => turns >= 1)).toBe(true);
  expect(await checkTokenBudgetRemainingStep(dataDir, state.id)).toBe(false);
});
