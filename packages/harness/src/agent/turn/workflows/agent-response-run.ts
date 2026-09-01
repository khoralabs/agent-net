import { resolveAgentEmbeddingModel } from "@khoralabs/memories-node/helpers/agent";
import { minimalAgentMemoriesOntology } from "@khoralabs/memories-service/client/agent";
import {
  ensureDevAgentIdentity,
  getAgentChatClientForDid,
  getAgentChatService,
  getAgentChatSigner,
} from "../../social/message/chat-service.ts";
import {
  createHarnessKhoraClientForAgent,
  resolveKhoraServerBaseUrl,
} from "../../social/tools/_helpers/khora-client-factory.ts";
import { type RunAgentWorkflowDependencies, runAgentWorkflow } from "../run-agent-workflow.ts";
import {
  createAgentMemoriesClientForAgent,
  resolveMemoriesServiceAdminToken,
  resolveMemoriesServiceBaseUrl,
} from "../tools/_helpers/toolkit-env.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "../types.ts";

export type AgentResponseDeps = RunAgentWorkflowDependencies;

/**
 * Agent-response body without a workflow step directive. Safe to call from a
 * host `"use step"` after the host has installed chat/ontology into the isolate.
 *
 * When no ontology is installed, uses {@link minimalAgentMemoriesOntology}.
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
    "../../memories/tools/_helpers/memories-ontology-install.ts"
  );

  const memoriesBaseUrl = resolveMemoriesServiceBaseUrl();
  const memoriesAdminToken = resolveMemoriesServiceAdminToken();
  const ontology =
    getInstalledMemoriesOntology() ??
    (memoriesBaseUrl !== undefined && memoriesAdminToken !== undefined
      ? minimalAgentMemoriesOntology
      : undefined);
  const agentDid = params.agent.actingFor.id;
  const memoriesClient =
    memoriesBaseUrl === undefined || memoriesAdminToken === undefined || ontology === undefined
      ? undefined
      : await createAgentMemoriesClientForAgent({
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

  const embeddingModel = resolveAgentEmbeddingModel();
  if (memoriesClient !== undefined && embeddingModel === undefined) {
    throw new Error(
      "AI_GATEWAY_API_KEY is required for agent-response memory search (set it on this service's env)",
    );
  }

  return runAgentWorkflow(params, {
    chatService: getAgentChatService(),
    chatSigner: getAgentChatSigner(),
    agentChat: getAgentChatClientForDid(agentDid),
    memoriesClient,
    khoraClient,
    embeddingModel,
  });
}
