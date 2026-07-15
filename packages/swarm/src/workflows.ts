import {
  type AgentTurnParams,
  configureTursoWorldEnv,
  emitNetworkEvent,
  networkEventId,
  runAgentTurn,
} from "@khoralabs/agent-net";
import { getRun, start } from "workflow/api";

import { assembleTurnContext } from "./assemble-turn-context.ts";
import { takeHarnessForSession } from "./pending-harness.ts";
import { getSwarmSession } from "./session-store.ts";
import { setupSwarm, teardownSwarm } from "./setup.ts";
import {
  checkTokenBudgetRemainingStep,
  getInboxCursor,
  incrementTokensUsedStep,
  listInboxEntriesSince,
  recordTurnTelemetryStep,
  setInboxCursor,
  summarizeSwarmState,
} from "./swarm-state.ts";
import type { AgentLoopResult, AgentLoopState, SwarmConfig, SwarmResult } from "./types.ts";

export async function assembleTurnParamsStep(
  _swarmStateId: string,
  agent: AgentLoopState,
  config: SwarmConfig,
): Promise<{
  params: AgentTurnParams;
  inboxEntryIds: string[];
}> {
  "use step";

  const session = getSwarmSession(config.sessionId);
  const agentChat = session.agents.find((entry) => entry.did === agent.did)?.chat;
  if (agentChat === undefined) {
    throw new Error(`agent chat client not found for ${agent.did}`);
  }
  const lastInboxEntryId = await getInboxCursor(config.dataDir, config.sessionId, agent.did);
  const inboxEntries = await listInboxEntriesSince(
    config.dataDir,
    config.sessionId,
    agent.did,
    lastInboxEntryId,
  );
  const { params, inboxEntryIds } = await assembleTurnContext({
    config,
    agent,
    agentChat,
    inboxEntries,
  });
  if (inboxEntryIds.length > 0) {
    await setInboxCursor(config.dataDir, config.sessionId, agent.did, inboxEntryIds.at(-1));
  }
  return { params, inboxEntryIds };
}

export async function setupSwarmStep(config: SwarmConfig): Promise<{
  swarmStateId: string;
  sessionId: string;
  agents: AgentLoopState[];
}> {
  "use step";
  configureTursoWorldEnv({ dataDir: config.dataDir });
  const harness = takeHarnessForSession(config.sessionId);
  return setupSwarm({ harness, config });
}

export async function teardownSwarmStep(sessionId: string): Promise<void> {
  "use step";
  await teardownSwarm(sessionId);
}

export async function spawnAgentLoopsStep(
  config: SwarmConfig,
  agents: AgentLoopState[],
  swarmStateId: string,
): Promise<string[]> {
  "use step";
  const runs = await Promise.all(
    agents.map((agent) => start(agentLoop, [config, agent, swarmStateId])),
  );
  return runs.map((run) => run.runId);
}

export async function awaitAgentLoopsStep(runIds: string[]): Promise<AgentLoopResult[]> {
  "use step";
  return Promise.all(
    runIds.map(async (runId) => {
      const run = getRun(runId);
      return (await run.returnValue) as AgentLoopResult;
    }),
  );
}

export async function summarizeSwarmStep(
  dataDir: string,
  swarmStateId: string,
  results: AgentLoopResult[],
): Promise<SwarmResult> {
  "use step";
  return summarizeSwarmState(dataDir, swarmStateId, results);
}

export async function agentLoop(
  config: SwarmConfig,
  agent: AgentLoopState,
  swarmStateId: string,
): Promise<AgentLoopResult> {
  "use workflow";

  configureTursoWorldEnv({ dataDir: config.dataDir });
  let turnCount = 0;

  while (await checkTokenBudgetRemainingStep(config.dataDir, swarmStateId)) {
    const { params, inboxEntryIds } = await assembleTurnParamsStep(swarmStateId, agent, config);
    await emitNetworkEvent({
      dataDir: config.dataDir,
      eventId: networkEventId({
        sessionId: config.sessionId,
        kind: "agent.turn.start",
        runId: params.runId,
        agentDid: agent.did,
        turnIndex: turnCount,
      }),
      sessionId: config.sessionId,
      tsMs: Date.now(),
      source: "agent",
      kind: "agent.turn.start",
      agentDid: agent.did,
      agentRole: agent.role,
      runId: params.runId,
      payload: { agentTurnIndex: turnCount, inboxEntryIds },
    });
    const result = await runAgentTurn(params);
    await recordTurnTelemetryStep(config.dataDir, swarmStateId, {
      sessionId: config.sessionId,
      agentTurnIndex: turnCount,
      agentDid: agent.did,
      agentRole: agent.role,
      runId: result.runId,
      usage: result.usage,
      capabilities: result.capabilities,
      memoriesProvenanceRootHex: result.memoriesProvenanceRootHex ?? "",
      threadHashes: result.threadHashes ?? [],
      inboxEntryIds,
    });
    await incrementTokensUsedStep(config.dataDir, swarmStateId, result.usage?.totalTokens ?? 0);
    turnCount++;
  }

  return { did: agent.did, turns: turnCount };
}

export async function swarmOrchestrator(config: SwarmConfig): Promise<SwarmResult> {
  "use workflow";

  configureTursoWorldEnv({ dataDir: config.dataDir });
  const { swarmStateId, sessionId, agents } = await setupSwarmStep(config);
  const loopRunIds = await spawnAgentLoopsStep(config, agents, swarmStateId);
  const results = await awaitAgentLoopsStep(loopRunIds);
  await teardownSwarmStep(sessionId);
  return summarizeSwarmStep(config.dataDir, swarmStateId, results);
}
