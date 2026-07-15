import { createRegisteredAgent } from "@khoralabs/agent-capabilities";

import { getAgentRegistry } from "../agent/agent-runtime.ts";
import { harnessToolkit } from "../agent/tools/index.ts";
import { spawnWithMemories, startNetworkHarness } from "../harness.ts";
import { requireKhoraBaseUrl } from "../lib/khora-base-url.ts";
import { registerNetworkSession, removeNetworkSession } from "../network/session-registry.ts";
import { emitNetworkEvent, networkEventId } from "../observability/network-log.ts";
import { ensureSwarmAgentRegistered } from "./agent-registry.ts";
import {
  putSwarmSession,
  removeSwarmSession,
  resolveSwarmAgentWorkflowDeps,
  type SwarmRuntimeSession,
} from "./session-store.ts";
import { appendInboxEntry, createSwarmState } from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

function selfThreadId(did: string): string {
  return `${did}-self`;
}

export function validateSwarmConfig(config: SwarmConfig): void {
  if (config.roles.length !== config.agentCount) {
    throw new Error(
      `roles length (${config.roles.length}) must equal agentCount (${config.agentCount})`,
    );
  }
  if (config.agentCount < 1) throw new Error("agentCount must be at least 1");
}

export async function setupSwarm(config: SwarmConfig): Promise<{
  swarmStateId: string;
  sessionId: string;
  agents: AgentLoopState[];
}> {
  validateSwarmConfig(config);

  await emitNetworkEvent({
    dataDir: config.dataDir,
    eventId: networkEventId({ sessionId: config.sessionId, kind: "swarm.setup.started" }),
    sessionId: config.sessionId,
    tsMs: Date.now(),
    source: "swarm",
    kind: "swarm.setup.started",
    message: "Starting swarm setup",
    payload: {
      agentCount: config.agentCount,
      roles: config.roles,
      goal: config.goal,
    },
  });

  const harness = await startNetworkHarness({
    dataDir: config.dataDir,
    khoraBaseUrl: requireKhoraBaseUrl(config.khoraBaseUrl),
  });
  const spawned = [];
  for (let i = 0; i < config.agentCount; i++) {
    spawned.push(await spawnWithMemories(harness));
  }

  const inboxConnections = [];
  const registry = getAgentRegistry();
  const loopStates: AgentLoopState[] = [];

  for (let i = 0; i < spawned.length; i++) {
    const agent = spawned[i];
    if (!agent) throw new Error("Agent not found");
    const role = config.roles[i];
    if (!role) throw new Error("Role not found");

    await agent.chat.createThread({
      id: selfThreadId(agent.did),
      metadata: { kind: "self", title: `${agent.did} self thread` },
    });

    const { staticHash, agent: registered } = await createRegisteredAgent({
      agentId: agent.did,
      name: `Agent ${i + 1}`,
      instructions: [config.goal, role],
      context: { sessionId: config.sessionId, did: agent.did, role },
      rootComposable: harnessToolkit,
    });
    if (!registry.has(agent.did)) {
      await registry.register(registered);
    }

    loopStates.push({
      did: agent.did,
      agentId: agent.did,
      role,
      selfThreadId: selfThreadId(agent.did),
      registeredStaticHash: staticHash,
      turnCount: 0,
    });

    inboxConnections.push(
      agent.connectInbox({
        onEvent: (event) => {
          void appendInboxEntry(config.dataDir, config.sessionId, agent.did, event);
        },
      }),
    );
  }

  const session: SwarmRuntimeSession = {
    config,
    harness,
    agents: spawned,
    loopStates,
    chatService: harness.signedChat.service,
    chatDb: harness.signedChat.db,
    inboxConnections,
  };

  putSwarmSession(config.sessionId, session);
  registerNetworkSession({
    sessionId: config.sessionId,
    dataDir: config.dataDir,
    resolveAgentWorkflowDeps: (did) => resolveSwarmAgentWorkflowDeps(config.sessionId, did),
    ensureAgentRegistered: (did) =>
      ensureSwarmAgentRegistered(getAgentRegistry(), config.dataDir, config.sessionId, did),
  });

  const swarmState = await createSwarmState(config.dataDir, config, loopStates);

  await emitNetworkEvent({
    dataDir: config.dataDir,
    eventId: networkEventId({ sessionId: config.sessionId, kind: "swarm.setup.completed" }),
    sessionId: config.sessionId,
    tsMs: Date.now(),
    source: "swarm",
    kind: "swarm.setup.completed",
    message: "Swarm setup completed",
    payload: {
      swarmStateId: swarmState.id,
      agents: loopStates.map((agent) => ({
        did: agent.did,
        role: agent.role,
        selfThreadId: agent.selfThreadId,
        registeredStaticHash: agent.registeredStaticHash,
      })),
    },
  });

  return {
    swarmStateId: swarmState.id,
    sessionId: config.sessionId,
    agents: loopStates,
  };
}

export async function teardownSwarm(sessionId: string): Promise<void> {
  const session = removeSwarmSession(sessionId);
  removeNetworkSession(sessionId);
  if (session === undefined) return;

  await emitNetworkEvent({
    dataDir: session.config.dataDir,
    eventId: networkEventId({ sessionId, kind: "swarm.teardown" }),
    sessionId,
    tsMs: Date.now(),
    source: "swarm",
    kind: "swarm.teardown",
    message: "Tearing down swarm session",
  });

  for (const connection of session.inboxConnections ?? []) {
    connection.close();
  }
  session.harness.stop();
}
