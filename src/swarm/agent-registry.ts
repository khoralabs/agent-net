import { type AgentRegistry, createRegisteredAgent } from "@khoralabs/agent-capabilities";

import { harnessToolkit } from "../agent/tools/index.ts";
import { loadSwarmStateBySessionId } from "./swarm-state.ts";

export async function ensureSwarmAgentRegistered(
  registry: AgentRegistry,
  dataDir: string,
  sessionId: string,
  agentDid: string,
): Promise<void> {
  if (registry.has(agentDid)) return;

  const state = await loadSwarmStateBySessionId(dataDir, sessionId);
  if (state === null) {
    throw new Error(`swarm session ${sessionId} not found in workflow db`);
  }

  const loopAgent = state.agents.find((agent) => agent.did === agentDid);
  if (loopAgent === undefined) {
    throw new Error(`agent ${agentDid} not registered in swarm session ${sessionId}`);
  }

  const { agent } = await createRegisteredAgent({
    agentId: agentDid,
    name: `Agent ${loopAgent.role}`,
    instructions: [state.config.goal, loopAgent.role],
    context: { sessionId, did: agentDid, role: loopAgent.role },
    rootComposable: harnessToolkit,
  });
  await registry.register(agent);
}
