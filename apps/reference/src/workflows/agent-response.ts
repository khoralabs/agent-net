import type { AgentWorkflowParams, AgentWorkflowResult } from "@khoralabs/agent-net";
import { start } from "workflow/api";

import { executeAgentResponse } from "./agent-response-step.ts";

/**
 * Reference-app durable agent-response workflow.
 * Hosting process must configure and start the Workflow world before invoking.
 */
export async function agentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use workflow";
  return await executeAgentResponse(params);
}

export async function startAgentResponseWorkflow(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  const run = await start(agentResponse, [params]);
  return run.returnValue as Promise<AgentWorkflowResult>;
}
