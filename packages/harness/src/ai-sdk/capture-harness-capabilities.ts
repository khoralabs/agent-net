import {
  type AgentCapabilitiesPersistence,
  captureAgentSnapshotEnvelope,
  defaultOpContext,
  type RegisteredAgent,
  recordTurnAttribution,
  type ToolPipelineHooks,
} from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";
import type { ToolSet } from "ai";
import {
  getAgentRegistry,
  getOnCapabilityTurnHook,
  type OnCapabilityTurn,
} from "../agent/turn/agent-runtime.ts";
import type { HarnessToolkitEnv } from "../agent/turn/tools/types.ts";
import type { AgentWorkflowParams } from "../agent/turn/types.ts";

type CaptureEnvelope = Awaited<ReturnType<typeof captureAgentSnapshotEnvelope>>;

function harnessSessionContext(params: AgentWorkflowParams): Record<string, unknown> {
  const chainId = params.context.chainId?.trim();
  const asDid = params.context.asDid?.trim();
  const threadId = params.output?.chat?.threadId?.trim() || params.context.threadId?.trim();
  return {
    sessionId: params.context.sessionId ?? params.runId,
    ...(threadId !== undefined && threadId.length > 0 ? { threadId } : {}),
    ...(chainId !== undefined && chainId.length > 0 ? { chainId } : {}),
    ...(asDid !== undefined && asDid.length > 0 ? { asDid } : {}),
  };
}

async function persistHarnessTurnLink(input: {
  persistence: AgentCapabilitiesPersistence;
  capture: CaptureEnvelope;
  sessionId: string;
}): Promise<void> {
  await recordTurnAttribution(input.persistence, {
    op: defaultOpContext(),
    sessionId: input.sessionId,
    link: input.capture.link,
  });
}

export async function captureHarnessCapabilities(input: {
  agent: RegisteredAgent;
  env: HarnessToolkitEnv;
  params: AgentWorkflowParams;
  pipelineHooks?: ToolPipelineHooks;
  capabilitiesPersistence?: AgentCapabilitiesPersistence;
  onCapabilityTurn?: OnCapabilityTurn;
}): Promise<{
  capture: CaptureEnvelope;
  aiTools: ToolSet;
  capabilities: {
    staticHash: string;
    runtimeHash: string;
    invocationHash?: string;
    toolRefs: Array<{ toolKey: string; toolHash: string }>;
    envelopeId?: string;
  };
}> {
  const capture = await captureAgentSnapshotEnvelope({
    agent: input.agent,
    ctx: {
      env: input.env,
      agentId: input.agent.agentId,
      agentName: input.agent.name,
      pipelineHooks: input.pipelineHooks,
    },
    invocationContext: { runId: input.params.runId },
    sessionContext: harnessSessionContext(input.params),
  });

  const toolRefs = capture.toolRefs.map(
    (toolRef: { toolKey?: string; key?: string; toolHash: string }) => ({
      toolKey: toolRef.toolKey ?? toolRef.key ?? "unknown",
      toolHash: toolRef.toolHash,
    }),
  );

  const persistence = input.capabilitiesPersistence ?? getAgentRegistry().persistence;
  try {
    await persistHarnessTurnLink({
      persistence,
      capture,
      sessionId: input.params.runId,
    });
  } catch (err) {
    console.warn(
      `harness: failed to persist capability turn attribution: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const onTurn = input.onCapabilityTurn ?? getOnCapabilityTurnHook();
  if (onTurn !== undefined) {
    try {
      await onTurn({
        runId: input.params.runId,
        agent: input.agent,
        link: capture.link,
        toolRefs,
      });
    } catch (err) {
      console.warn(
        `harness: onCapabilityTurn failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const aiTools = toolMapToAiTools(capture.evaluatedTools, {
    env: input.env,
    resolvedPolicies: new Map(),
    pipelineHooks: input.pipelineHooks,
  }) as ToolSet;

  return {
    capture,
    aiTools,
    capabilities: {
      staticHash: capture.link.staticHash,
      runtimeHash: capture.link.runtimeHash,
      invocationHash: capture.link.invocationHash,
      toolRefs,
    },
  };
}
