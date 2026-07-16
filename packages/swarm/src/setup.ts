import type { NetworkHarnessHandle } from "@khoralabs/agent-net";
import { emitNetworkEvent, networkEventId } from "@khoralabs/agent-net";

import { ensureSwarmAgentRegistered } from "./agent-registry.ts";
import type { SwarmMemoriesOntology } from "./pending-ontology.ts";
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

export async function setupSwarm(input: {
  harness: NetworkHarnessHandle;
  config: SwarmConfig;
  ontology: SwarmMemoriesOntology;
}): Promise<{
  swarmStateId: string;
  sessionId: string;
  agents: AgentLoopState[];
}> {
  const { harness, config, ontology } = input;
  validateSwarmConfig(config);

  await emitNetworkEvent({
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

  const spawned = [];
  for (let i = 0; i < config.agentCount; i++) {
    spawned.push(await harness.spawn({ ontology }));
  }

  const inboxConnections = [];
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

    const { staticHash } = await harness.registerAgent({
      agent,
      name: `Agent ${i + 1}`,
      instructions: [config.goal, role],
      context: { sessionId: config.sessionId, did: agent.did, role },
    });

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
    chatService: harness.signedChat.client,
    inboxConnections,
  };

  putSwarmSession(config.sessionId, session);
  harness.bindNetworkSession({
    sessionId: config.sessionId,
    dataDir: config.dataDir,
    resolveAgentWorkflowDeps: (did) => resolveSwarmAgentWorkflowDeps(config.sessionId, did),
    ensureAgentRegistered: (did) =>
      ensureSwarmAgentRegistered(harness, config.dataDir, config.sessionId, did),
  });

  const swarmState = await createSwarmState(config.dataDir, config, loopStates);

  await emitNetworkEvent({
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
  if (session === undefined) return;

  session.harness.unbindNetworkSession(sessionId);

  await emitNetworkEvent({
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
