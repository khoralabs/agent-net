import { createRegisteredAgent, type RegisteredAgent } from "@khoralabs/agent-capabilities";
import { harnessToolkit } from "../tools/index.ts";
// Embedded string (not a runtime .txt read) so Nitro/bun builds include the content.
import ADS_STE100 from "./ads-ste100.ts";

export const HARNESS_AGENT_ID = "network-harness-agent";
export type HarnessAgentDefinition = {
  staticHash: string;
  agent: RegisteredAgent;
};

export async function defineHarnessAgent(): Promise<HarnessAgentDefinition> {
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: HARNESS_AGENT_ID,
    name: "Network Harness Agent",
    instructions: [ADS_STE100, "Respond helpfully based on the conversation context."],
    context: { role: "network-harness-agent" },
    rootComposable: harnessToolkit,
  });
  return { staticHash, agent };
}
