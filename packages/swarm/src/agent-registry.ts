import type { NetworkHarnessHandle } from "@khoralabs/agent-net-harness";

import { loadSwarmStateBySessionId } from "./swarm-state.ts";

export async function ensureSwarmAgentRegistered(
  harness: NetworkHarnessHandle,
  dataDir: string,
  sessionId: string,
  agentDid: string,
): Promise<void> {
  const state = await loadSwarmStateBySessionId(dataDir, sessionId);
  if (state === null) {
    throw new Error(`swarm session ${sessionId} not found in workflow db`);
  }

  const loopAgent = state.agents.find((agent) => agent.did === agentDid);
  if (loopAgent === undefined) {
    throw new Error(`agent ${agentDid} not registered in swarm session ${sessionId}`);
  }

  await harness.ensureAgentRegistered({
    agentDid,
    name: `Agent ${loopAgent.role}`,
    instructions: [state.config.goal, loopAgent.role],
    context: { sessionId, did: agentDid, role: loopAgent.role },
  });
}
