import { describe, expect, test } from "bun:test";
import { computeAgentEffectiveCapabilities } from "./effective.ts";
import {
  createAllowAllEntitlementResolver,
  createDenyAllEntitlementResolver,
} from "./entitlement.ts";
import { createHostCapabilitiesFacade } from "./facade.ts";
import { HOST_CAPABILITY } from "./ids.ts";
import { createHostCapabilityRegistry } from "./registry.ts";

describe("computeAgentEffectiveCapabilities", () => {
  test("retains availability and entitlement; missing decisions deny", () => {
    const registry = createHostCapabilityRegistry();
    registry.register({ id: HOST_CAPABILITY.chat, availability: "available" });
    registry.register({ id: HOST_CAPABILITY.memories, availability: "unavailable" });
    registry.register({ id: HOST_CAPABILITY.khora, availability: "degraded" });
    const manifest = registry.getManifest({ baseUrl: "https://example.com" });

    const effective = computeAgentEffectiveCapabilities({
      manifest,
      entitlements: {
        agentDid: "did:key:test",
        revision: "r1",
        computedAt: "2026-09-16T00:00:00.000Z",
        entitlements: [
          { capabilityId: HOST_CAPABILITY.chat, decision: "allowed" },
          { capabilityId: HOST_CAPABILITY.memories, decision: "allowed" },
          // khora omitted → denied
        ],
      },
    });

    const byId = Object.fromEntries(effective.capabilities.map((c) => [c.capabilityId, c]));
    expect(byId[HOST_CAPABILITY.chat]).toMatchObject({
      effective: true,
      entitlement: "allowed",
      availability: "available",
    });
    expect(byId[HOST_CAPABILITY.memories]).toMatchObject({
      effective: false,
      entitlement: "allowed",
      availability: "unavailable",
      blockedBy: "unavailable",
    });
    expect(byId[HOST_CAPABILITY.khora]).toMatchObject({
      effective: false,
      entitlement: "denied",
      availability: "degraded",
      blockedBy: "denied",
    });
  });

  test("marks unknown entitlement ids as unsupported", () => {
    const registry = createHostCapabilityRegistry();
    registry.register({ id: HOST_CAPABILITY.pool });
    const manifest = registry.getManifest({ baseUrl: "https://example.com" });
    const effective = computeAgentEffectiveCapabilities({
      manifest,
      entitlements: {
        agentDid: "did:key:test",
        revision: "r1",
        computedAt: "2026-09-16T00:00:00.000Z",
        entitlements: [{ capabilityId: "custom-plugin", decision: "allowed" }],
      },
    });
    expect(effective.capabilities.find((c) => c.capabilityId === "custom-plugin")).toMatchObject({
      effective: false,
      supported: false,
      blockedBy: "unsupported",
    });
  });
});

describe("createHostCapabilitiesFacade", () => {
  test("defaults to deny-all entitlements", async () => {
    const registry = createHostCapabilityRegistry();
    registry.register({ id: HOST_CAPABILITY.chat });
    const facade = createHostCapabilitiesFacade({
      registry,
      baseUrl: "https://example.com",
    });
    const effective = await facade.resolveAgentCapabilities("did:key:agent");
    expect(effective.capabilities).toEqual([
      expect.objectContaining({
        capabilityId: HOST_CAPABILITY.chat,
        effective: false,
        entitlement: "denied",
        blockedBy: "denied",
      }),
    ]);
  });

  test("allow-all helper opts into legacy behavior", async () => {
    const registry = createHostCapabilityRegistry();
    registry.register({ id: HOST_CAPABILITY.chat });
    registry.register({ id: HOST_CAPABILITY.relay });
    const facade = createHostCapabilitiesFacade({
      registry,
      baseUrl: "https://example.com",
      entitlementResolver: createAllowAllEntitlementResolver({
        capabilityIds: () => registry.list().map((c) => c.id),
      }),
    });
    const effective = await facade.resolveAgentCapabilities("did:key:agent");
    expect(effective.capabilities.every((c) => c.effective)).toBe(true);
  });

  test("deny-all resolver returns empty entitlements", async () => {
    const resolver = createDenyAllEntitlementResolver();
    const set = await resolver({ agentDid: "did:key:x", manifestRevision: "0" });
    expect(set.entitlements).toEqual([]);
  });
});
