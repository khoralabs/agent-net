import { requireNetworkSession } from "../../network/session-registry.ts";
import { runAgentWorkflow } from "../run-agent-workflow.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "../types.ts";
import { AI_STEP_MAX_RETRIES } from "../workflow-resilience.ts";
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
  const { resolveHarnessEmbeddingModel } = await import(
    "../tools/memories/_helpers/embedding-model.ts"
  );
  const networkDeps = await session.resolveAgentWorkflowDeps(params.agent.actingFor.id);
  return runAgentWorkflow(params, {
    ...networkDeps,
    embeddingModel: resolveHarnessEmbeddingModel(),
  });
}
runAgentResponseStep.maxRetries = AI_STEP_MAX_RETRIES;
