import {
  createRegisteredAgent,
  type RegisteredAgent,
  toolkit,
} from "@khoralabs/agent-capabilities";

import { memoriesToolkit } from "../tools/memories/_toolkit.ts";
import { skillsToolkit } from "../tools/skills/_toolkit.ts";

export const NETWORK_NEGOTIATION_AGENT_ID = "network-negotiation-agent";

export type NegotiationAgentDefinition = {
  staticHash: string;
  agent: RegisteredAgent;
};

const negotiationToolkit = toolkit([memoriesToolkit, skillsToolkit], {
  name: "network-negotiation",
});

export async function defineNegotiationAgent(): Promise<NegotiationAgentDefinition> {
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: NETWORK_NEGOTIATION_AGENT_ID,
    name: "Network Negotiation Agent",
    instructions: [
      "Negotiate on an NBC chain. Emit one structured turn object. Never act as the peer DID.",
    ],
    context: { role: "network-negotiation-agent" },
    rootComposable: negotiationToolkit,
  });
  return { staticHash, agent };
}
