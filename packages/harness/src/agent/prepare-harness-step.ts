import type { AgentCapabilitiesPersistence } from "@khoralabs/agent-capabilities";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { ToolSet } from "ai";
import type { AgentChatClient } from "../chat.ts";
import {
  captureHarnessCapabilities,
  createHarnessAgentTelemetry,
  getAgentRegistry,
  type OnCapabilityTurn,
  resolveWorkflowAgent,
} from "./agent-runtime.ts";
import { formatAgentStepContext, resolveAgentStepContext } from "./step-context.ts";
import { createHarnessToolkitEnv } from "./tools/_helpers/toolkit-env.ts";
import type { HarnessToolkitEnv } from "./tools/types.ts";
import type { AgentStepContext, AgentWorkflowParams } from "./types.ts";

export type PrepareHarnessStepInput = {
  /** Explicit step context bag (preferred). */
  stepContext?: AgentStepContext;
  /** Legacy framing; folded into stepContext.database when unset. */
  memoriesDatabase?: AgentStepContext["database"];
  turnInstructions?: string[];
  /** When set, also build toolkit env (and optionally capture tools). */
  runtime?: {
    agentId: string;
    agentDid?: string;
    runId: string;
    sessionId?: string;
    threadId?: string;
    networkDataDir?: string;
    memoriesClient?: RemoteMemoriesClientAsync;
    khoraClient?: KhoraClient;
    embeddingModel?: EmbeddingModel;
    agentChat?: AgentChatClient;
    disableToolkits?: readonly string[];
    disableTools?: readonly string[];
    nbc?: import("./tools/types.ts").HarnessToolkitEnv["nbc"];
    /** Capture harness tools for chat / tool-loop modes. */
    captureTools?: boolean;
    /** Full workflow params required when captureTools is true. */
    workflowParams?: AgentWorkflowParams;
    /** Override process-local registry persistence for turn link attribution. */
    capabilitiesPersistence?: AgentCapabilitiesPersistence;
    /** Host durability hook after capture (e.g. static snapshots). */
    onCapabilityTurn?: OnCapabilityTurn;
  };
};

export type PreparedHarnessStep = {
  stepContext: AgentStepContext | undefined;
  /** Formatted instruction blocks from {@link formatAgentStepContext}. */
  contextInstructions: string[];
  env?: HarnessToolkitEnv;
  aiTools?: ToolSet;
  capture?: Awaited<ReturnType<typeof captureHarnessCapabilities>>["capture"];
  capabilities?: Awaited<ReturnType<typeof captureHarnessCapabilities>>["capabilities"];
};

/**
 * Shared gather→format prepare path for chat and integrate LLM steps.
 * Always formats step context; optionally builds toolkit env / captures tools.
 */
export async function prepareHarnessStepRuntime(
  input: PrepareHarnessStepInput,
): Promise<PreparedHarnessStep> {
  const stepContext = resolveAgentStepContext({
    stepContext: input.stepContext,
    memoriesDatabase: input.memoriesDatabase,
    turnInstructions: input.turnInstructions,
  });
  const contextInstructions = formatAgentStepContext(stepContext);

  const runtime = input.runtime;
  if (runtime === undefined) {
    return { stepContext, contextInstructions };
  }

  const env = await createHarnessToolkitEnv({
    memoriesClient: runtime.memoriesClient,
    khoraClient: runtime.khoraClient,
    embeddingModel: runtime.embeddingModel,
    agentChat: runtime.agentChat,
    agentDid: runtime.agentDid,
    sessionId: runtime.sessionId,
    networkDataDir: runtime.networkDataDir,
    disableToolkits: runtime.disableToolkits,
    disableTools: runtime.disableTools,
    ...(stepContext?.database !== undefined ? { memoriesContext: stepContext.database } : {}),
    ...(runtime.nbc !== undefined ? { nbc: runtime.nbc } : {}),
  });

  if (runtime.captureTools !== true || runtime.workflowParams === undefined) {
    return { stepContext, contextInstructions, env };
  }

  const registry = getAgentRegistry();
  const { agent } = await resolveWorkflowAgent(registry, runtime.agentId, {
    sessionId: runtime.sessionId,
  });
  const telemetry = createHarnessAgentTelemetry(runtime.agentDid ?? runtime.agentId);
  const { capture, aiTools, capabilities } = await captureHarnessCapabilities({
    agent,
    env,
    params: runtime.workflowParams,
    pipelineHooks: telemetry.pipelineHooks,
    ...(runtime.capabilitiesPersistence !== undefined
      ? { capabilitiesPersistence: runtime.capabilitiesPersistence }
      : {}),
    ...(runtime.onCapabilityTurn !== undefined
      ? { onCapabilityTurn: runtime.onCapabilityTurn }
      : {}),
  });
  telemetry.linkCapture({
    link: capture.link,
    toolRefs: capture.toolRefs,
    invocationContext: { runId: runtime.runId },
    sessionContext: {
      sessionId: runtime.sessionId ?? runtime.runId,
      ...(runtime.threadId !== undefined && runtime.threadId.length > 0
        ? { threadId: runtime.threadId }
        : {}),
      ...(runtime.workflowParams?.context.chainId !== undefined
        ? { chainId: runtime.workflowParams.context.chainId }
        : {}),
      ...(runtime.workflowParams?.context.asDid !== undefined
        ? { asDid: runtime.workflowParams.context.asDid }
        : {}),
    },
  });

  return {
    stepContext,
    contextInstructions,
    env,
    aiTools,
    capture,
    capabilities,
  };
}
