import { start } from "workflow/api";
import { requireNetworkSession } from "../../network/session-registry.ts";
import {
  ensureDevAgentIdentity,
  getAgentChatClientForDid,
  getAgentChatService,
  getAgentChatSigner,
} from "../chat-service.ts";
import { type RunAgentWorkflowDependencies, runAgentWorkflow } from "../run-agent-workflow.ts";
import {
  createHarnessMemoriesClientForAgent,
  resolveMemoriesServiceAdminToken,
  resolveMemoriesServiceBaseUrl,
} from "../tools/_helpers/toolkit-env.ts";
import {
  createHarnessKhoraClientForAgent,
  resolveKhoraServerBaseUrl,
} from "../tools/khora/_helpers/khora-client-factory.ts";
import { resolveHarnessEmbeddingModel } from "../tools/memories/_helpers/embedding-model.ts";
import { minimalHarnessMemoriesOntology } from "../tools/memories/_helpers/minimal-ontology.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "../types.ts";
import { AI_STEP_MAX_RETRIES } from "../workflow-resilience.ts";

export type AgentResponseDeps = RunAgentWorkflowDependencies;

/**
 * Durable agent-response workflow.
 * The hosting process must configure and start the Workflow world (e.g. Turso)
 * before invoking this — harness workflows do not select a world backend.
 *
 * Hosts that need a richer-than-minimal memories ontology must install it in the
 * step isolate's module graph (static import side effects), then call
 * {@link runExecuteAgentResponse} from their own `"use step"` entry — or start
 * this default workflow, which uses {@link minimalHarnessMemoriesOntology} when
 * none is installed.
 */
export async function agentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use workflow";

  return await executeAgentResponse(params);
}

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

/**
 * Agent-response body without a workflow step directive. Safe to call from a
 * host `"use step"` after the host has installed chat/ontology into the isolate.
 */
export async function runExecuteAgentResponse(
  params: AgentWorkflowParams,
  deps?: AgentResponseDeps,
): Promise<AgentWorkflowResult> {
  if (deps !== undefined) {
    return runAgentWorkflow(params, deps);
  }

  const { getInstalledMemoriesOntology } = await import(
    "../tools/memories/_helpers/memories-ontology-install.ts"
  );

  const memoriesBaseUrl = resolveMemoriesServiceBaseUrl();
  const memoriesAdminToken = resolveMemoriesServiceAdminToken();
  const ontology =
    getInstalledMemoriesOntology() ??
    (memoriesBaseUrl !== undefined && memoriesAdminToken !== undefined
      ? minimalHarnessMemoriesOntology
      : undefined);
  const agentDid = params.agent.actingFor.id;
  const memoriesClient =
    memoriesBaseUrl === undefined || memoriesAdminToken === undefined || ontology === undefined
      ? undefined
      : await createHarnessMemoriesClientForAgent({
          baseUrl: memoriesBaseUrl,
          agentDid,
          ontology,
          adminToken: memoriesAdminToken,
        });

  const khoraBaseUrl = resolveKhoraServerBaseUrl();
  const khoraClient =
    khoraBaseUrl === undefined
      ? undefined
      : await createHarnessKhoraClientForAgent({
          baseUrl: khoraBaseUrl,
          agentDid,
        });

  await ensureDevAgentIdentity();

  return runAgentWorkflow(params, {
    chatService: getAgentChatService(),
    chatSigner: getAgentChatSigner(),
    agentChat: getAgentChatClientForDid(agentDid),
    memoriesClient,
    khoraClient,
    embeddingModel: resolveHarnessEmbeddingModel(),
  });
}

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

export async function startAgentResponseWorkflow(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  const run = await start(agentResponse, [params]);
  return run.returnValue as Promise<AgentWorkflowResult>;
}
