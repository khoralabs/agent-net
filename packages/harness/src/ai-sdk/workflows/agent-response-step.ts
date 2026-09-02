import type { AgentWorkflowParams, AgentWorkflowResult } from "../../agent/turn/types.ts";
import { AI_STEP_MAX_RETRIES } from "../../agent/turn/workflow-resilience.ts";
import { requireNetworkSession } from "../../pool/network/session-registry.ts";
import { runAgentWorkflow } from "../run-agent-workflow.ts";
import { type AgentResponseDeps, runExecuteAgentResponse } from "./agent-response-run.ts";

/**
 * Default harness step entry. Hosts with custom step prelude should call
 * {@link runExecuteAgentResponse} from their own `"use step"` instead.
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

  const sessionId = params.context.sessionId;
  if (sessionId === undefined || sessionId.length === 0) {
    return runExecuteAgentResponse(params);
  }

  const session = requireNetworkSession(sessionId);
  const { resolveAgentEmbeddingModel } = await import("@khoralabs/memories-node/helpers/agent");
  const networkDeps = await session.resolveAgentWorkflowDeps(params.agent.actingFor.id);
  const embeddingModel = resolveAgentEmbeddingModel();
  if (networkDeps.memoriesClient !== undefined && embeddingModel === undefined) {
    throw new Error(
      "AI_GATEWAY_API_KEY is required for agent-response memory search (set it on this service's env)",
    );
  }
  return runAgentWorkflow(params, {
    ...(networkDeps as AgentResponseDeps),
    embeddingModel,
  });
}
runAgentResponseStep.maxRetries = AI_STEP_MAX_RETRIES;
