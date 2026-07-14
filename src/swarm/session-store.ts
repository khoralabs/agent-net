import type { Database } from "bun:sqlite";
import type { ChatService } from "@khoralabs/chat-core";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

import type { AgentHandle, InboxConnection } from "../agents";
import type { AgentChatClient } from "../chat.ts";
import type { NetworkHarnessHandle } from "../harness.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

export type SwarmRuntimeSession = {
  config: SwarmConfig;
  harness: NetworkHarnessHandle;
  agents: AgentHandle[];
  loopStates: AgentLoopState[];
  chatService: ChatService;
  chatDb: Database;
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

export type SwarmAgentWorkflowDeps = {
  chatService: ChatService;
  agentChat: AgentChatClient;
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  sessionId: string;
  networkDataDir: string;
  chatDb: Database;
};

export async function resolveSwarmAgentWorkflowDeps(
  sessionId: string,
  did: string,
): Promise<SwarmAgentWorkflowDeps> {
  const session = getSwarmSession(sessionId);
  const agent = session.agents.find((entry) => entry.did === did);
  if (agent === undefined) throw new Error(`agent ${did} not found in session ${sessionId}`);

  const { createHarnessMemoriesClient, agentMemoriesDatabase } = await import(
    "../agent/tools/memories/_helpers/memories-client.ts"
  );
  const { createHarnessKhoraClientForAgent } = await import(
    "../agent/tools/khora/_helpers/khora-client-factory.ts"
  );

  const memoriesClient = await createHarnessMemoriesClient({
    baseUrl: session.harness.memoriesBaseUrl,
    database: agentMemoriesDatabase(did),
  });

  const khoraClient = await createHarnessKhoraClientForAgent({
    baseUrl: session.harness.serverBaseUrl,
    agentDid: did,
    agentsDataDir: `${session.config.dataDir}/agents`,
  });

  return {
    chatService: session.chatService,
    agentChat: agent.chat,
    memoriesClient,
    khoraClient,
    sessionId,
    networkDataDir: session.config.dataDir,
    chatDb: session.chatDb,
  };
}
