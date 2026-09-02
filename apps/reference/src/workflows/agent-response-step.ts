import type { AgentWorkflowParams, AgentWorkflowResult } from "@khoralabs/agent-net";
import { AI_STEP_MAX_RETRIES } from "@khoralabs/agent-net";
import {
  type AgentResponseDeps,
  runAgentResponseWithSession,
  runExecuteAgentResponse,
} from "@khoralabs/agent-net/ai-sdk";

/**
 * Reference-app durable step wrappers. The published package stays directive-free;
 * hosts own `"use step"` / `"use workflow"`.
 */

export async function executeAgentResponse(
  params: AgentWorkflowParams,
  deps?: AgentResponseDeps,
): Promise<AgentWorkflowResult> {
  "use step";
  return runExecuteAgentResponse(params, deps);
}
executeAgentResponse.maxRetries = AI_STEP_MAX_RETRIES;

export async function runAgentResponseStep(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  "use step";
  return runAgentResponseWithSession(params);
}
runAgentResponseStep.maxRetries = AI_STEP_MAX_RETRIES;
