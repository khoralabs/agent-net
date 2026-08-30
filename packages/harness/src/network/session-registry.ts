/**
 * Workflow deps resolved per agent for an active network session.
 * Owned by the control plane so session-registry does not import agent/turn.
 * Host registration supplies a value compatible with turn's RunAgentWorkflowDependencies.
 */
export type NetworkAgentWorkflowDeps = {
  chatService?: unknown;
  chatSigner?: unknown;
  agentChat?: unknown;
  sessionId?: string;
  networkDataDir?: string;
  streamTextFn?: unknown;
  memoriesClient?: unknown;
  khoraClient?: unknown;
  embeddingModel?: unknown;
};

export type NetworkRuntimeSession = {
  sessionId: string;
  dataDir: string;
  resolveAgentWorkflowDeps(agentDid: string): Promise<NetworkAgentWorkflowDeps>;
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
