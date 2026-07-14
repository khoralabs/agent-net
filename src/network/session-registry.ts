import type { RunAgentWorkflowDependencies } from "../agent/run-agent-workflow.ts";

export type NetworkRuntimeSession = {
  sessionId: string;
  dataDir: string;
  resolveAgentWorkflowDeps(agentDid: string): Promise<RunAgentWorkflowDependencies>;
  ensureAgentRegistered?(agentDid: string): Promise<void>;
};

const sessions = new Map<string, NetworkRuntimeSession>();

export function registerNetworkSession(session: NetworkRuntimeSession): void {
  sessions.set(session.sessionId, session);
}

export function getNetworkSession(sessionId: string): NetworkRuntimeSession | undefined {
  return sessions.get(sessionId);
}

export function requireNetworkSession(sessionId: string): NetworkRuntimeSession {
  const session = sessions.get(sessionId);
  if (session === undefined) throw new Error(`network session ${sessionId} is not active`);
  return session;
}

export function removeNetworkSession(sessionId: string): NetworkRuntimeSession | undefined {
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  return session;
}

export function resetNetworkSessionRegistryForTests(): void {
  sessions.clear();
}
