import type { ChatSigner, PostModelMetadata, PostUsage } from "@khoralabs/chat-core";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import {
  convertToModelMessages,
  type ModelMessage,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import type { AgentChatClient, ChatServiceClient } from "../chat.ts";
import { collectThreadHashSnapshots } from "../network/thread-provenance.ts";
import { buildNetworkAttribution } from "../observability/attribution-digest.ts";
import { runWithAttributionAsync } from "../observability/network-log.ts";
import {
  captureHarnessCapabilities,
  createHarnessAgentTelemetry,
  getAgentRegistry,
  resolveGatewayModel,
  resolveWorkflowAgent,
} from "./agent-runtime.ts";
import { createAgentChatWriter } from "./chat-writer.ts";
import { createHarnessToolkitEnv } from "./tools/_helpers/toolkit-env.ts";
import { formatSkillCatalog } from "./tools/skills/_helpers/skills.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "./types.ts";
import {
  buildUserLocalDateTimeContext,
  formatUserLocalDateTimeInstruction,
} from "./user-local-datetime.ts";

export type RunAgentWorkflowDependencies = {
  chatService?: ChatServiceClient;
  chatSigner?: ChatSigner;
  agentChat?: AgentChatClient;
  sessionId?: string;
  networkDataDir?: string;
  streamTextFn?: typeof streamText;
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  embeddingModel?: EmbeddingModel;
};

function assistantMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: text.length > 0 ? [{ type: "text", text }] : [],
  };
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  const direct = typeof record.message === "string" ? record.message : undefined;
  if (direct !== undefined && direct !== "[object Object]") return direct;
  return direct ?? String(error);
}

function userFacingGenerationError(): string {
  return "I couldn't generate a response. Please try again.";
}

function usageFromAiSdk(usage: unknown): PostUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  return {
    inputTokens: numberOrUndefined(value.inputTokens ?? value.promptTokens),
    outputTokens: numberOrUndefined(value.outputTokens ?? value.completionTokens),
    totalTokens: numberOrUndefined(value.totalTokens),
    reasoningTokens: numberOrUndefined(value.reasoningTokens),
    cachedInputTokens: numberOrUndefined(value.cachedInputTokens),
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function modelMetadata(input: {
  requestedModel: string;
  finishReason?: unknown;
  response?: unknown;
}): PostModelMetadata {
  const response = input.response && typeof input.response === "object" ? input.response : {};
  const record = response as Record<string, unknown>;
  return {
    provider: typeof record.provider === "string" ? record.provider : undefined,
    model: typeof record.modelId === "string" ? record.modelId : undefined,
    gatewayModel: input.requestedModel,
    finishReason: typeof input.finishReason === "string" ? input.finishReason : undefined,
  };
}

async function normalizeContext(params: AgentWorkflowParams): Promise<{
  messages: UIMessage[];
  modelMessages: ModelMessage[];
  instructions: string[];
}> {
  if (params.runId.trim().length === 0) throw new Error("runId is required");
  if (params.agent.id.trim().length === 0) throw new Error("agent.id is required");
  if (params.model.id.trim().length === 0) throw new Error("model.id is required");
  if (params.output.chat.threadId.trim().length === 0) {
    throw new Error("output.chat.threadId is required");
  }

  const messages = params.context.messages as UIMessage[];
  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(messages);
  } catch {
    modelMessages = messages.map((message) => ({
      role: message.role,
      content: (message.parts as Array<{ type: string; text?: string }>)
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join(""),
    })) as ModelMessage[];
  }

  const userLocalDateTimeInstruction =
    params.context.userTimeZone !== undefined
      ? formatUserLocalDateTimeInstruction(
          buildUserLocalDateTimeContext(params.context.userTimeZone),
        )
      : null;

  return {
    messages,
    modelMessages,
    instructions: [userLocalDateTimeInstruction, ...(params.context.instructions ?? [])].filter(
      (instruction): instruction is string => instruction !== null,
    ),
  };
}

export async function runAgentWorkflow(
  params: AgentWorkflowParams,
  deps: RunAgentWorkflowDependencies = {},
): Promise<AgentWorkflowResult> {
  const context = await normalizeContext(params);
  const registry = getAgentRegistry();
  const { agent } = await resolveWorkflowAgent(registry, params.agent.id, {
    sessionId: deps.sessionId ?? params.context.sessionId,
  });
  const env = await createHarnessToolkitEnv({
    memoriesClient: deps.memoriesClient,
    khoraClient: deps.khoraClient,
    embeddingModel: deps.embeddingModel,
    agentChat: deps.agentChat,
    agentDid: params.agent.actingFor.id,
    sessionId: deps.sessionId ?? params.context.sessionId,
    networkDataDir: deps.networkDataDir,
  });
  const telemetry = createHarnessAgentTelemetry(params.agent.actingFor.id);
  const { capture, aiTools, capabilities } = await captureHarnessCapabilities({
    agent,
    env,
    params,
    pipelineHooks: telemetry.pipelineHooks,
  });
  telemetry.linkCapture({
    link: capture.link,
    toolRefs: capture.toolRefs,
    invocationContext: { runId: params.runId },
    sessionContext: {
      sessionId: params.context.sessionId ?? params.runId,
      threadId: params.output.chat.threadId,
    },
  });

  const turnAttribution = buildNetworkAttribution({
    capabilities,
    memoriesProvenanceRootHex: env.memoriesSnapshotRootHex ?? "",
    threadHashes: [],
  });

  if (deps.chatService === undefined) {
    throw new Error("chatService is required");
  }
  const writer = createAgentChatWriter({
    client: deps.chatService,
    params,
    signer: deps.chatSigner,
  });
  let text = "";
  let streamStarted = false;
  const modelId = resolveGatewayModel(params.model.id);
  const runStreamText = deps.streamTextFn ?? streamText;
  let generationError: unknown;

  return runWithAttributionAsync(turnAttribution, async () => {
    try {
      await writer.start(assistantMessage(writer.postId, ""));
      streamStarted = true;

      const maxSteps = params.model.maxSteps ?? 8;
      const result = runStreamText({
        model: modelId,
        system: [capture.instructions, formatSkillCatalog(env.skills), ...context.instructions]
          .filter((part) => part.length > 0)
          .join("\n\n"),
        messages: context.modelMessages,
        tools: aiTools,
        stopWhen: stepCountIs(maxSteps),
        onError: ({ error }) => {
          generationError = error;
        },
      } as Parameters<typeof streamText>[0]);
      const finishReasonPromise = Promise.resolve(result.finishReason).catch(() => undefined);
      const usagePromise = Promise.resolve(result.usage).catch(() => undefined);
      const responsePromise = Promise.resolve(result.response).catch(() => undefined);
      const textPromise = Promise.resolve(result.text).catch(() => "");

      try {
        for await (const delta of result.textStream) {
          text += delta;
          if (params.output.chat.streamDeltas) {
            await writer.apply(assistantMessage(writer.postId, text));
          }
        }
      } catch (error) {
        generationError = error;
      }

      text = text.length > 0 ? text : await textPromise;
      if (text.length === 0) {
        const detail = generationError === undefined ? "" : `: ${errorMessage(generationError)}`;
        throw new Error(`agent workflow produced no text output${detail}`);
      }

      const [finishReason, usage, response] = await Promise.all([
        finishReasonPromise,
        usagePromise,
        responsePromise,
      ]);
      const metadata = {
        model: modelMetadata({ requestedModel: modelId, finishReason, response }),
        usage: usageFromAiSdk(usage),
      };
      await writer.apply(assistantMessage(writer.postId, text), metadata);
      const message = await writer.complete();

      const threadHashes =
        deps.agentChat !== undefined && deps.chatService !== undefined
          ? await collectThreadHashSnapshots(deps.chatService, deps.agentChat)
          : undefined;

      return {
        runId: params.runId,
        chat: {
          threadId: params.output.chat.threadId,
          postId: writer.postId,
          status: "complete",
        },
        message,
        usage: metadata.usage,
        memoriesProvenanceRootHex: env.memoriesSnapshotRootHex,
        threadHashes,
        capabilities,
      };
    } catch (error) {
      if (streamStarted && text.length === 0) {
        await writer
          .apply(assistantMessage(writer.postId, userFacingGenerationError()))
          .then(() => writer.complete())
          .catch(() => undefined);
      } else if (streamStarted) {
        await writer.abort().catch(() => undefined);
      }
      throw error;
    }
  });
}
