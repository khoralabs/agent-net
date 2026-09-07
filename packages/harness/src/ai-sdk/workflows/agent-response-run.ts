import { resolveAgentEmbeddingModel } from "@khoralabs/memories-node/helpers/agent";
import {
  ensureDevAgentIdentity,
  getAgentChatClientForDid,
  getAgentChatService,
  getAgentChatSigner,
} from "../../agent/social/message/chat-service.ts";
import {
  createHarnessKhoraClientForAgent,
  resolveKhoraServerBaseUrl,
} from "../../agent/social/tools/_helpers/khora-client-factory.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "../../agent/turn/types.ts";
import { requireNetworkSession } from "../../pool/network/session-registry.ts";
import { type RunAgentWorkflowDependencies, runAgentWorkflow } from "../run-agent-workflow.ts";
import {
  isOptionalMemoriesUnavailable,
  resolveBoundAgentMemoriesClient,
} from "./resolve-bound-memories-client.ts";

export type AgentResponseDeps = RunAgentWorkflowDependencies;

/**
 * Agent-response body without a Workflow directive. Hosts wrap this in their
 * own durable step entry after installing chat/ontology into the isolate.
 *
 * Resolves memories via session-bound deps when `context.sessionId` is set;
 * otherwise uses Bearer admin-token adapters when configured.
 */
export async function runExecuteAgentResponse(
  params: AgentWorkflowParams,
  deps?: AgentResponseDeps,
): Promise<AgentWorkflowResult> {
  if (deps !== undefined) {
    return runAgentWorkflow(params, deps);
  }

  const agentDid = params.agent.actingFor.id;
  const sessionId = params.context.sessionId;
  let memoriesClient: AgentResponseDeps["memoriesClient"];
  try {
    memoriesClient = await resolveBoundAgentMemoriesClient({
      agentDid,
      sessionId,
      allowMinimalOntology: true,
    });
  } catch (err) {
    if (!isOptionalMemoriesUnavailable(err)) {
      throw err;
    }
    memoriesClient = undefined;
  }

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

/**
 * Resolve network-session deps then run the agent-response body.
 * Directive-free; hosts wrap with a durable step when needed.
 */
export async function runAgentResponseWithSession(
  params: AgentWorkflowParams,
): Promise<AgentWorkflowResult> {
  const sessionId = params.context.sessionId;
  if (sessionId === undefined || sessionId.length === 0) {
    return runExecuteAgentResponse(params);
  }

  const session = requireNetworkSession(sessionId);
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
