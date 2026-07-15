import type {
  AgentChatClient,
  AgentHandle,
  HarnessAgentWorkflowDeps,
  InboxConnection,
  NetworkHarnessHandle,
} from "@khoralabs/agent-net";
import type { ChatService } from "@khoralabs/chat-core";

import type { AgentLoopState, SwarmConfig } from "./types.ts";

export type SwarmRuntimeSession = {
  config: SwarmConfig;
  harness: NetworkHarnessHandle;
  agents: AgentHandle[];
  loopStates: AgentLoopState[];
  chatService: ChatService;
  inboxConnections: InboxConnection[];
};

/** Live process handles (harness, WS connections) — not serializable; keyed by sessionId for the active run. */
const sessions = new Map<string, SwarmRuntimeSession>();

export function putSwarmSession(sessionId: string, session: SwarmRuntimeSession): void {
  sessions.set(sessionId, session);
}

export function getSwarmSession(sessionId: string): SwarmRuntimeSession {
  const session = sessions.get(sessionId);
  if (session === undefined) throw new Error(`swarm session ${sessionId} is not active`);
  return session;
}

export function removeSwarmSession(sessionId: string): SwarmRuntimeSession | undefined {
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  return session;
}

export function getAgentChatClient(sessionId: string, did: string): AgentChatClient {
  const session = getSwarmSession(sessionId);
  const agent = session.agents.find((entry) => entry.did === did);
  if (agent === undefined) throw new Error(`agent ${did} not found in session ${sessionId}`);
  return agent.chat;
}

export type SwarmAgentWorkflowDeps = HarnessAgentWorkflowDeps;

export async function resolveSwarmAgentWorkflowDeps(
  sessionId: string,
  did: string,
): Promise<SwarmAgentWorkflowDeps> {
  const session = getSwarmSession(sessionId);
  const agent = session.agents.find((entry) => entry.did === did);
  if (agent === undefined) throw new Error(`agent ${did} not found in session ${sessionId}`);

  return session.harness.resolveAgentWorkflowDeps(agent, {
    sessionId,
    dataDir: session.config.dataDir,
  });
}
