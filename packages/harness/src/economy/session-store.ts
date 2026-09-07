import type { AgentChatClient, ChatServiceClient } from "../agent/social/message/chat.ts";
import type { AgentHandle, HarnessAgentWorkflowDeps, NetworkHarnessHandle } from "../index.ts";

import type { EconomyNegotiateRuntime } from "./encounter-registry.ts";
import type { EconomyActor, EconomyConfig, EconomyScenario } from "./types.ts";

export type EconomyRuntimeSession = {
  config: EconomyConfig;
  harness: NetworkHarnessHandle;
  agents: AgentHandle[];
  actors: EconomyActor[];
  chatService: ChatServiceClient;
  scenario: EconomyScenario;
  /** Opaque host/scenario bag; never emit private objectives on shared events. */
  scenarioState: unknown;
  economyStateId: string;
  inboxUnsubscribes: Array<() => void>;
  negotiate?: EconomyNegotiateRuntime;
};

const sessions = new Map<string, EconomyRuntimeSession>();

export function putEconomySession(sessionId: string, session: EconomyRuntimeSession): void {
  sessions.set(sessionId, session);
}

export function getEconomySession(sessionId: string): EconomyRuntimeSession {
  const session = sessions.get(sessionId);
  if (session === undefined) throw new Error(`economy session ${sessionId} is not active`);
  return session;
}

export function removeEconomySession(sessionId: string): EconomyRuntimeSession | undefined {
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  return session;
}

export function resetEconomySessionsForTests(): void {
  sessions.clear();
}

export function getEconomyAgentChatClient(sessionId: string, did: string): AgentChatClient {
  const session = getEconomySession(sessionId);
  const agent = session.agents.find((entry) => entry.did === did);
  if (agent === undefined) throw new Error(`agent ${did} not found in session ${sessionId}`);
  return agent.chat;
}

export type EconomyAgentWorkflowDeps = HarnessAgentWorkflowDeps;

export async function resolveEconomyAgentWorkflowDeps(
  sessionId: string,
  did: string,
): Promise<EconomyAgentWorkflowDeps> {
  const session = getEconomySession(sessionId);
  const agent = session.agents.find((entry) => entry.did === did);
  if (agent === undefined) throw new Error(`agent ${did} not found in session ${sessionId}`);

  return session.harness.resolveAgentWorkflowDeps(agent, {
    sessionId,
    dataDir: session.config.dataDir,
  });
}
