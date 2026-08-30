import {
  createRegisteredAgent,
  type RegisteredAgent,
  toolkit,
} from "@khoralabs/agent-capabilities";

import { buildPlannerInstructions, type ResolvedResponsePlanOptions } from "../response-plan.ts";

export const RESPONSE_PLANNER_AGENT_ID = "network-response-planner";

export type ResponsePlannerDefinition = {
  staticHash: string;
  agent: RegisteredAgent;
};

const emptyToolkit = toolkit([], {
  name: "response-planner",
});

export async function defineResponsePlannerAgent(
  options: ResolvedResponsePlanOptions,
): Promise<ResponsePlannerDefinition> {
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: RESPONSE_PLANNER_AGENT_ID,
    name: "Network Response Planner",
    instructions: buildPlannerInstructions(options),
    context: { role: "network-response-planner" },
    rootComposable: emptyToolkit,
  });
  return { staticHash, agent };
}
