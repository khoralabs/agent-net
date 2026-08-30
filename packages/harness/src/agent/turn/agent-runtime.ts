import {
  type AgentCapabilitiesPersistence,
  type AgentRegistry,
  type CapabilityLink,
  type CreateAgentRegistryOptions,
  captureAgentSnapshotEnvelope,
  createAgentRegistry,
  defaultOpContext,
  type RegisteredAgent,
  recordTurnAttribution,
  type ToolPipelineHooks,
} from "@khoralabs/agent-capabilities";
import { toolMapToAiTools } from "@khoralabs/agent-capabilities-ai-sdk";
import type { ToolSet } from "ai";
import { getNetworkSession } from "../../network/session-registry.ts";
import { createHarnessAgentTelemetry } from "../../observability/harness-observability.ts";
import { defineHarnessAgent } from "./capability-agents/index.ts";
import {
  defineNegotiationAgent,
  NETWORK_NEGOTIATION_AGENT_ID,
} from "./capability-agents/network-negotiation-agent.ts";
import type { HarnessToolkitEnv } from "./tools/types.ts";
import type { AgentWorkflowParams } from "./types.ts";

export { createHarnessAgentTelemetry };

type CaptureEnvelope = Awaited<ReturnType<typeof captureAgentSnapshotEnvelope>>;

/**
 * Host hook after a turn capability capture.
 * Neutral payload only — no host storage types (SQLite/HTTP/snapshots).
 */
export type OnCapabilityTurn = (info: {
  runId: string;
  agent: RegisteredAgent;
  link: CapabilityLink;
  toolRefs: Array<{ toolKey: string; toolHash: string }>;
}) => void | Promise<void>;

let agentRegistry: AgentRegistry | undefined;
let onCapabilityTurnHook: OnCapabilityTurn | undefined;

/**
 * Configure the process-local capability agent registry before first use.
 * Pass a host {@link AgentCapabilitiesPersistence} implementation for turn hash attribution.
 */
export function configureHarnessAgentRegistry(
  options?: CreateAgentRegistryOptions & { onCapabilityTurn?: OnCapabilityTurn },
): AgentRegistry {
  if (options?.onCapabilityTurn !== undefined) {
    onCapabilityTurnHook = options.onCapabilityTurn;
  }
  if (agentRegistry !== undefined) {
    return agentRegistry;
  }
  agentRegistry = createAgentRegistry(options);
  return agentRegistry;
}

/**
 * Register a host callback for post-capture durability (e.g. static snapshots).
 * Does not replace an already-configured registry.
 */
export function configureHarnessCapabilityTurnHook(hook: OnCapabilityTurn | undefined): void {
  onCapabilityTurnHook = hook;
}

export function getCapabilityRegistry(): AgentRegistry {
  if (agentRegistry === undefined) agentRegistry = createAgentRegistry();
  return agentRegistry;
}

/** @deprecated Prefer {@link getCapabilityRegistry}. */
export function getAgentRegistry(): AgentRegistry {
  return getCapabilityRegistry();
}

/** Test helper: reset the module-local registry and turn hook. */
export function resetHarnessAgentRegistryForTests(): void {
  agentRegistry = undefined;
  onCapabilityTurnHook = undefined;
}

export function resolveGatewayModel(modelId: string): string {
  const id = modelId.trim() || process.env.AGENT_DEFAULT_MODEL?.trim();
  if (id === undefined || id.length === 0) throw new Error("model.id is required");
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    throw new Error("AI_GATEWAY_API_KEY environment variable not set");
  }
  return id;
}

export async function registerHarnessAgent(
  registry: AgentRegistry,
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  const defined = await defineHarnessAgent();
  if (registry.has(defined.agent.agentId)) {
    const entry = registry.get(defined.agent.agentId);
    if (entry === undefined) throw new Error(`registry inconsistency for ${defined.agent.agentId}`);
    return { staticHash: entry.agent.staticHash, agent: entry.agent };
  }
  await registry.register(defined.agent);
  return defined;
}

export async function registerNegotiationAgent(
  registry: AgentRegistry,
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  const defined = await defineNegotiationAgent();
  if (registry.has(defined.agent.agentId)) {
    const entry = registry.get(defined.agent.agentId);
    if (entry === undefined) {
      throw new Error(`registry inconsistency for ${defined.agent.agentId}`);
    }
    return { staticHash: entry.agent.staticHash, agent: entry.agent };
  }
  await registry.register(defined.agent);
  return defined;
}

export async function resolveWorkflowAgent(
  registry: AgentRegistry,
  agentId: string,
  opts?: { sessionId?: string },
): Promise<{ staticHash: string; agent: RegisteredAgent }> {
  if (registry.has(agentId)) {
    const entry = registry.get(agentId);
    if (entry === undefined) throw new Error(`registry inconsistency for ${agentId}`);
    return { staticHash: entry.agent.staticHash, agent: entry.agent };
  }

  const sessionId = opts?.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    const session = getNetworkSession(sessionId);
    if (session?.ensureAgentRegistered !== undefined) {
      await session.ensureAgentRegistered(agentId);
    }
    if (registry.has(agentId)) {
      const entry = registry.get(agentId);
      if (entry === undefined) throw new Error(`registry inconsistency for ${agentId}`);
      return { staticHash: entry.agent.staticHash, agent: entry.agent };
    }
  }

  if (agentId === NETWORK_NEGOTIATION_AGENT_ID) {
    return registerNegotiationAgent(registry);
  }

  return registerHarnessAgent(registry);
}

async function persistHarnessTurnLink(input: {
  persistence: AgentCapabilitiesPersistence;
  capture: CaptureEnvelope;
  /** Session key: harness/workflow runId. */
  sessionId: string;
}): Promise<void> {
  await recordTurnAttribution(input.persistence, {
    op: defaultOpContext(),
    sessionId: input.sessionId,
    link: input.capture.link,
    // Intentionally omit full affordance envelopes (PII / large tool context).
  });
}

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

export async function captureHarnessCapabilities(input: {
  agent: RegisteredAgent;
  env: HarnessToolkitEnv;
  params: AgentWorkflowParams;
  pipelineHooks?: ToolPipelineHooks;
  /** Defaults to {@link getAgentRegistry}.persistence */
  capabilitiesPersistence?: AgentCapabilitiesPersistence;
  /** Host durability hook (e.g. static agent snapshots). Defaults to process hook. */
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

  const onTurn = input.onCapabilityTurn ?? onCapabilityTurnHook;
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
