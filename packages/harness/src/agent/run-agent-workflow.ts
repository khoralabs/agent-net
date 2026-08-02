import type { ChatSigner, PostModelMetadata, PostUsage } from "@khoralabs/chat";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import {
  convertToModelMessages,
  type ModelMessage,
  NoOutputGeneratedError,
  readUIMessageStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { FatalError } from "workflow";

import type { AgentChatClient, ChatServiceClient } from "../chat.ts";
import { collectThreadHashSnapshots } from "../network/thread-provenance.ts";
import { buildNetworkAttribution } from "../observability/attribution-digest.ts";
import { runWithAttributionAsync } from "../observability/network-log.ts";
import { sourcesFromMemoryToolParts } from "./agent-memory-source.ts";
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
import { activateSkillByName } from "./tools/skills/activate-skill.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "./types.ts";
import {
  buildUserLocalDateTimeContext,
  formatUserLocalDateTimeInstruction,
} from "./user-local-datetime.ts";
import { AGENT_STEP_TIMEOUT_MS, rethrowAsFatalAiNoOutput } from "./workflow-resilience.ts";

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

function textFromUIMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * Set assistant text without wiping non-text parts (reasoning, tools).
 * When there are no parts yet, returns a text-only message.
 */
export function withAssistantText(message: UIMessage, text: string): UIMessage {
  if (message.parts.length === 0) {
    return assistantMessage(message.id, text);
  }
  const nonText = message.parts.filter((part) => part.type !== "text");
  return {
    ...message,
    parts: [...nonText, { type: "text", text }],
  };
}

type ToolResultLike = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
};

/**
 * UI message streams sometimes omit tool parts even when tools executed.
 * Merge completed tool results onto the assistant message before chat persistence.
 */
export function mergeToolResultsIntoMessage(
  message: UIMessage,
  toolResults: readonly ToolResultLike[],
): UIMessage {
  if (toolResults.length === 0) return message;
  const existingIds = new Set<string>();
  for (const part of message.parts) {
    if (
      typeof part === "object" &&
      part !== null &&
      typeof (part as { type?: unknown }).type === "string" &&
      (part as { type: string }).type.startsWith("tool-") &&
      typeof (part as { toolCallId?: unknown }).toolCallId === "string"
    ) {
      existingIds.add((part as { toolCallId: string }).toolCallId);
    }
  }
  const additions: UIMessage["parts"] = [];
  for (const result of toolResults) {
    if (existingIds.has(result.toolCallId)) continue;
    additions.push({
      type: `tool-${result.toolName}`,
      toolCallId: result.toolCallId,
      state: "output-available",
      input: result.input,
      output: result.output,
    } as UIMessage["parts"][number]);
  }
  if (additions.length === 0) return message;
  return { ...message, parts: [...message.parts, ...additions] };
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
    disableToolkits: params.tools?.disableToolkits,
    disableTools: params.tools?.disableTools,
    ...(params.context.memoriesDatabase !== undefined
      ? { memoriesContext: params.context.memoriesDatabase }
      : {}),
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

  const preActivatedSkillBodies: string[] = [];
  for (const hint of params.responsePlan?.skillHints ?? []) {
    try {
      const activated = await activateSkillByName(env, hint);
      if (activated.content !== undefined && activated.content.trim().length > 0) {
        preActivatedSkillBodies.push(activated.content);
      }
    } catch {
      // Unknown / unloadable hints must not fail the turn.
    }
  }

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
  let latest: UIMessage = assistantMessage(params.output.chat.postId ?? params.runId, "");
  let streamStarted = false;
  const modelId = resolveGatewayModel(params.model.id);
  const runStreamText = deps.streamTextFn ?? streamText;
  let generationError: unknown;

  return runWithAttributionAsync(turnAttribution, async () => {
    try {
      await writer.start(assistantMessage(writer.postId, ""));
      streamStarted = true;

      const maxSteps = params.model.maxSteps ?? 8;
      const abortSignal = AbortSignal.timeout(AGENT_STEP_TIMEOUT_MS);
      const collectedToolResults: ToolResultLike[] = [];
      const result = runStreamText({
        model: modelId,
        system: [
          capture.instructions,
          formatSkillCatalog(env.skills),
          ...preActivatedSkillBodies,
          ...context.instructions,
        ]
          .filter((part) => part.length > 0)
          .join("\n\n"),
        messages: context.modelMessages,
        tools: aiTools,
        stopWhen: stepCountIs(maxSteps),
        abortSignal,
        ...(params.model.reasoning !== undefined ? { reasoning: params.model.reasoning } : {}),
        ...(params.model.maxOutputTokens !== undefined
          ? { maxOutputTokens: params.model.maxOutputTokens }
          : {}),
        onError: ({ error }) => {
          generationError = error;
        },
        onStepFinish: ({ toolResults }) => {
          for (const toolResult of toolResults) {
            collectedToolResults.push({
              toolCallId: toolResult.toolCallId,
              toolName: toolResult.toolName,
              input: toolResult.input,
              output: toolResult.output,
            });
          }
        },
      } as Parameters<typeof streamText>[0]);
      const finishReasonPromise = Promise.resolve(result.finishReason).catch(() => undefined);
      const usagePromise = Promise.resolve(result.usage).catch(() => undefined);
      const responsePromise = Promise.resolve(result.finalStep)
        .then((step) => step.response)
        .catch(() => undefined);
      const textPromise = Promise.resolve(result.text).catch(() => "");
      const toolResultsPromise = Promise.resolve(result.toolResults).catch(
        () => [] as ToolResultLike[],
      );

      try {
        const uiChunkStream = toUIMessageStream({
          stream: result.stream,
          tools: aiTools,
          generateMessageId: () => writer.postId,
        });
        for await (const message of readUIMessageStream({
          message: latest,
          stream: uiChunkStream,
          onError: (error) => {
            generationError = error;
          },
        })) {
          latest = { ...message, id: writer.postId, role: "assistant" };
          if (params.output.chat.streamDeltas) {
            await writer.apply(latest);
          }
        }
      } catch (error) {
        generationError = error;
      }

      let text = textFromUIMessage(latest);
      if (text.length === 0) {
        text = await textPromise;
        if (text.length > 0) {
          latest = withAssistantText({ ...latest, id: writer.postId, role: "assistant" }, text);
        }
      }
      if (text.length === 0) {
        if (NoOutputGeneratedError.isInstance(generationError)) {
          rethrowAsFatalAiNoOutput(generationError, "agentResponse");
        }
        const detail = generationError === undefined ? "" : `: ${errorMessage(generationError)}`;
        throw new FatalError(`agent workflow produced no text output${detail}`);
      }

      const settledToolResults = await toolResultsPromise;
      const toolResults = settledToolResults.length > 0 ? settledToolResults : collectedToolResults;
      latest = mergeToolResultsIntoMessage(latest, toolResults);

      const [finishReason, usage, response] = await Promise.all([
        finishReasonPromise,
        usagePromise,
        responsePromise,
      ]);
      const metadata = {
        model: modelMetadata({ requestedModel: modelId, finishReason, response }),
        usage: usageFromAiSdk(usage),
      };
      const memorySources = sourcesFromMemoryToolParts(latest.parts);
      const priorMeta =
        latest.metadata !== null &&
        latest.metadata !== undefined &&
        typeof latest.metadata === "object"
          ? (latest.metadata as Record<string, unknown>)
          : {};
      latest = {
        ...latest,
        metadata: {
          ...priorMeta,
          ...(memorySources.length > 0 ? { sources: memorySources } : {}),
        },
      };
      await writer.apply(latest, metadata);
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
      if (streamStarted && textFromUIMessage(latest).length === 0) {
        await writer
          .apply(assistantMessage(writer.postId, userFacingGenerationError()))
          .then(() => writer.complete())
          .catch(() => undefined);
      } else if (streamStarted) {
        await writer.abort().catch(() => undefined);
      }
      rethrowAsFatalAiNoOutput(error, "agentResponse");
    }
  });
}
