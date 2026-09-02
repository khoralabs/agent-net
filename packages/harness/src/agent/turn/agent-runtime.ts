import {
  type AgentRegistry,
  type CapabilityLink,
  type CreateAgentRegistryOptions,
  createAgentRegistry,
  type RegisteredAgent,
} from "@khoralabs/agent-capabilities";
import { getNetworkSession } from "../../pool/network/session-registry.ts";
import { createHarnessAgentTelemetry } from "../../pool/observability/harness-observability.ts";
import { defineHarnessAgent } from "./capability-agents/index.ts";
import {
  defineNegotiationAgent,
  NETWORK_NEGOTIATION_AGENT_ID,
} from "./capability-agents/network-negotiation-agent.ts";

export { createHarnessAgentTelemetry };

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

/** Process-local durability hook for capability capture (used by `./ai-sdk`). */
export function getOnCapabilityTurnHook(): OnCapabilityTurn | undefined {
  return onCapabilityTurnHook;
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
