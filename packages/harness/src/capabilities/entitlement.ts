import { z } from "zod";

export const zEntitlementDecision = z.enum(["allowed", "denied"]);

export type EntitlementDecision = z.infer<typeof zEntitlementDecision>;

export const zAgentEntitlement = z.object({
  capabilityId: z.string().min(1),
  decision: zEntitlementDecision,
  /** Host-defined scopes (e.g. namespace paths). Opaque to agent-net. */
  scopes: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

export type AgentEntitlement = z.infer<typeof zAgentEntitlement>;

export const zAgentEntitlementSet = z.object({
  agentDid: z.string().min(1),
  revision: z.string().min(1),
  entitlements: z.array(zAgentEntitlement),
  computedAt: z.string().datetime(),
});

export type AgentEntitlementSet = z.infer<typeof zAgentEntitlementSet>;

/**
 * Host-owned entitlement policy. Auth transport is established by the caller;
 * this resolver only answers what a DID may access on the host.
 */
export type AgentEntitlementResolver = (input: {
  agentDid: string;
  manifestRevision: string;
}) => AgentEntitlementSet | Promise<AgentEntitlementSet>;

/**
 * Deny every capability by returning an empty entitlement set.
 * Missing decisions are treated as denied by {@link computeAgentEffectiveCapabilities}.
 */
export function createDenyAllEntitlementResolver(): AgentEntitlementResolver {
  return ({ agentDid }) => ({
    agentDid,
    revision: "deny-all",
    entitlements: [],
    computedAt: new Date().toISOString(),
  });
}

/**
 * Explicit legacy helper: allow every capability id currently on the manifest.
 * Hosts that want allow-all must opt in; the default is deny-missing.
 */
export function createAllowAllEntitlementResolver(input: {
  capabilityIds: () => readonly string[];
}): AgentEntitlementResolver {
  return ({ agentDid, manifestRevision }) => ({
    agentDid,
    revision: `allow-all:${manifestRevision}`,
    entitlements: input.capabilityIds().map((capabilityId) => ({
      capabilityId,
      decision: "allowed" as const,
    })),
    computedAt: new Date().toISOString(),
  });
}
