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

export type AgentResponseDeps = RunAgentWorkflowDependencies;

/**
 * Agent-response body without a workflow step directive. Safe to call from a
 * host `"use step"` after the host has installed chat/ontology into the isolate.
 *
 * When no ontology is installed, uses {@link minimalHarnessMemoriesOntology}.
 * Hosts that need a richer ontology must install it in the step module graph.
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
