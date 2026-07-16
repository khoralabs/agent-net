import { start } from "workflow/api";
import { requireNetworkSession } from "../../network/session-registry.ts";
import {
  ensureDevAgentIdentity,
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
import type { AgentWorkflowParams, AgentWorkflowResult } from "../types.ts";

export type AgentResponseDeps = RunAgentWorkflowDependencies;

/**
 * Durable agent-response workflow.
 * The hosting process must configure and start the Workflow world (e.g. Turso)
 * before invoking this — harness workflows do not select a world backend.
 */
export async function agentResponse(params: AgentWorkflowParams): Promise<AgentWorkflowResult> {
  "use workflow";

  return await executeAgentResponse(params);
}

export async function executeAgentResponse(
  params: AgentWorkflowParams,
  deps?: AgentResponseDeps,
): Promise<AgentWorkflowResult> {
  "use step";

  if (deps !== undefined) {
    return runAgentWorkflow(params, deps);
  }

  const memoriesBaseUrl = resolveMemoriesServiceBaseUrl();
  const memoriesAdminToken = resolveMemoriesServiceAdminToken();
  const { getInstalledMemoriesOntology } = await import(
    "../tools/memories/_helpers/memories-ontology-install.ts"
  );
  const ontology = getInstalledMemoriesOntology();
  const memoriesClient =
    memoriesBaseUrl === undefined || memoriesAdminToken === undefined || ontology === undefined
      ? undefined
      : await createHarnessMemoriesClientForAgent({
          baseUrl: memoriesBaseUrl,
          agentDid: params.agent.actingFor.id,
          ontology,
          adminToken: memoriesAdminToken,
        });

  const khoraBaseUrl = resolveKhoraServerBaseUrl();
  const khoraClient =
    khoraBaseUrl === undefined
      ? undefined
      : await createHarnessKhoraClientForAgent({
          baseUrl: khoraBaseUrl,
          agentDid: params.agent.actingFor.id,
        });

  await ensureDevAgentIdentity();

  return runAgentWorkflow(params, {
    chatService: getAgentChatService(),
    chatSigner: getAgentChatSigner(),
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
    return executeAgentResponse(params);
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

export async function startAgentResponseWorkflow(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  const run = await start(agentResponse, [params]);
  return run.returnValue as Promise<AgentWorkflowResult>;
}
