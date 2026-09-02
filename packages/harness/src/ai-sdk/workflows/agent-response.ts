import { start } from "workflow/api";

import type { AgentWorkflowParams, AgentWorkflowResult } from "../../agent/turn/types.ts";
import { executeAgentResponse } from "./agent-response-step.ts";

/**
 * Durable agent-response workflow.
 * The hosting process must configure and start the Workflow world (e.g. local)
 * before invoking this — harness workflows do not select a world backend.
 *
 * This file must stay free of Node.js imports (`node:*`) and must not re-export
 * step/run helpers (that would pull Node into the workflow graph). Step
 * implementation lives in {@link ./agent-response-step.ts}.
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
