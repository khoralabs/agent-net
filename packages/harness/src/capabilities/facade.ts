import { type AgentEffectiveCapabilities, computeAgentEffectiveCapabilities } from "./effective.ts";
import type { AgentEntitlementResolver } from "./entitlement.ts";
import { createDenyAllEntitlementResolver } from "./entitlement.ts";
import type { AgentNetHostManifest } from "./manifest.ts";
import type { HostCapabilityRegistry } from "./registry.ts";
import { createHostCapabilityRegistry } from "./registry.ts";

export type HostCapabilitiesFacade = {
  readonly registry: HostCapabilityRegistry;
  getManifest(): AgentNetHostManifest;
  resolveAgentCapabilities(agentDid: string): Promise<AgentEffectiveCapabilities>;
};

export type CreateHostCapabilitiesFacadeOptions = {
  /** Defaults to a new empty in-memory registry. */
  registry?: HostCapabilityRegistry;
  /**
   * Public base URL for the capability HTTP surface (discovery `baseUrl`).
   * Required for {@link HostCapabilitiesFacade.getManifest}.
   */
  baseUrl: string;
  /**
   * Host-owned entitlement policy. Defaults to deny-all (missing decisions deny).
   * Pass {@link createAllowAllEntitlementResolver} for explicit legacy allow-all.
   */
  entitlementResolver?: AgentEntitlementResolver;
};

export function createHostCapabilitiesFacade(
  opts: CreateHostCapabilitiesFacadeOptions,
): HostCapabilitiesFacade {
  const registry = opts.registry ?? createHostCapabilityRegistry();
  const entitlementResolver = opts.entitlementResolver ?? createDenyAllEntitlementResolver();
  const baseUrl = opts.baseUrl.trim().replace(/\/+$/, "");
  if (baseUrl.length === 0) {
    throw new Error("createHostCapabilitiesFacade: baseUrl is required");
  }

  return {
    registry,
    getManifest() {
      return registry.getManifest({ baseUrl });
    },
    async resolveAgentCapabilities(agentDid) {
      const did = agentDid.trim();
      if (did.length === 0) {
        throw new Error("resolveAgentCapabilities: agentDid is required");
      }
      const manifest = registry.getManifest({ baseUrl });
      const entitlements = await entitlementResolver({
        agentDid: did,
        manifestRevision: manifest.revision,
      });
      return computeAgentEffectiveCapabilities({ manifest, entitlements });
    },
  };
}
