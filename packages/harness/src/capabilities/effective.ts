import type { AgentEntitlement, AgentEntitlementSet } from "./entitlement.ts";
import type {
  AgentNetHostManifest,
  HostCapabilityAvailability,
  HostCapabilityEntry,
} from "./manifest.ts";

export type EffectiveBlockedBy = "unsupported" | "unavailable" | "denied";

export type EffectiveCapabilityEntry = {
  capabilityId: string;
  /** True only when supported, not unavailable, and entitlement is allowed. */
  effective: boolean;
  supported: boolean;
  availability: HostCapabilityAvailability | "unsupported";
  entitlement: "allowed" | "denied";
  blockedBy?: EffectiveBlockedBy;
  scopes?: string[];
  reason?: string;
  statusDetail?: string;
};

export type AgentEffectiveCapabilities = {
  agentDid: string;
  manifestRevision: string;
  entitlementRevision: string;
  computedAt: string;
  capabilities: EffectiveCapabilityEntry[];
};

function entitlementById(set: AgentEntitlementSet): Map<string, AgentEntitlement> {
  const map = new Map<string, AgentEntitlement>();
  for (const entry of set.entitlements) {
    map.set(entry.capabilityId, entry);
  }
  return map;
}

/**
 * Combine host manifest availability with host-owned entitlements.
 * Missing entitlement decisions are denied. Effective responses retain both layers.
 */
export function computeAgentEffectiveCapabilities(input: {
  manifest: AgentNetHostManifest;
  entitlements: AgentEntitlementSet;
}): AgentEffectiveCapabilities {
  const byId = entitlementById(input.entitlements);
  const capabilities: EffectiveCapabilityEntry[] = input.manifest.capabilities.map(
    (entry: HostCapabilityEntry) => {
      const entitlement = byId.get(entry.id);
      const decision = entitlement?.decision ?? "denied";
      const unavailable = entry.availability === "unavailable";
      let blockedBy: EffectiveBlockedBy | undefined;
      if (unavailable) {
        blockedBy = "unavailable";
      } else if (decision === "denied") {
        blockedBy = "denied";
      }
      const effective = !unavailable && decision === "allowed";
      const out: EffectiveCapabilityEntry = {
        capabilityId: entry.id,
        effective,
        supported: true,
        availability: entry.availability,
        entitlement: decision,
      };
      if (blockedBy !== undefined) out.blockedBy = blockedBy;
      if (entitlement?.scopes !== undefined) out.scopes = entitlement.scopes;
      if (entitlement?.reason !== undefined) out.reason = entitlement.reason;
      if (entry.statusDetail !== undefined) out.statusDetail = entry.statusDetail;
      return out;
    },
  );

  // Include explicitly denied/allowed ids that are not on the manifest (unsupported).
  for (const entitlement of input.entitlements.entitlements) {
    if (capabilities.some((c) => c.capabilityId === entitlement.capabilityId)) continue;
    const out: EffectiveCapabilityEntry = {
      capabilityId: entitlement.capabilityId,
      effective: false,
      supported: false,
      availability: "unsupported",
      entitlement: entitlement.decision,
      blockedBy: "unsupported",
    };
    if (entitlement.scopes !== undefined) out.scopes = entitlement.scopes;
    if (entitlement.reason !== undefined) out.reason = entitlement.reason;
    capabilities.push(out);
  }

  capabilities.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));

  return {
    agentDid: input.entitlements.agentDid,
    manifestRevision: input.manifest.revision,
    entitlementRevision: input.entitlements.revision,
    computedAt: input.entitlements.computedAt,
    capabilities,
  };
}
