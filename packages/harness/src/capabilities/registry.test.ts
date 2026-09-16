import { describe, expect, test } from "bun:test";
import { buildAgentNetDiscovery } from "./discovery.ts";
import { AGENT_NET_HTTP_PATH } from "./http/routes.ts";
import { HOST_CAPABILITY } from "./ids.ts";
import { zAgentNetDiscovery } from "./manifest.ts";
import { createHostCapabilityRegistry } from "./registry.ts";

describe("createHostCapabilityRegistry", () => {
  test("registers, lists deterministically, and bumps revision", () => {
    const registry = createHostCapabilityRegistry();
    expect(registry.revision()).toBe("0");

    registry.register({
      id: HOST_CAPABILITY.chat,
      description: "Signed chat",
      version: "1.0.0",
      endpoint: "https://example.com/chat",
    });
    registry.register({
      id: HOST_CAPABILITY.khora,
      availability: "degraded",
      statusDetail: "search offline",
    });

    expect(registry.revision()).toBe("2");
    expect(registry.list().map((c) => c.id)).toEqual([HOST_CAPABILITY.chat, HOST_CAPABILITY.khora]);
    expect(registry.get(HOST_CAPABILITY.khora)?.availability).toBe("degraded");
  });

  test("rejects duplicate registration and unknown update", () => {
    const registry = createHostCapabilityRegistry();
    registry.register({ id: HOST_CAPABILITY.pool });
    expect(() => registry.register({ id: HOST_CAPABILITY.pool })).toThrow(/already registered/);
    expect(() => registry.update({ id: HOST_CAPABILITY.chat })).toThrow(/Unknown capability/);
  });

  test("update, setAvailability, and unregister", () => {
    const registry = createHostCapabilityRegistry();
    registry.register({ id: HOST_CAPABILITY.relay, availability: "available" });
    const before = registry.revision();

    registry.update({
      id: HOST_CAPABILITY.relay,
      description: "Relay",
      availability: "degraded",
    });
    expect(registry.get(HOST_CAPABILITY.relay)?.description).toBe("Relay");
    expect(registry.revision()).not.toBe(before);

    registry.setAvailability(HOST_CAPABILITY.relay, "unavailable", "down for maintenance");
    expect(registry.get(HOST_CAPABILITY.relay)).toMatchObject({
      availability: "unavailable",
      statusDetail: "down for maintenance",
    });

    expect(registry.unregister(HOST_CAPABILITY.relay)).toBe(true);
    expect(registry.get(HOST_CAPABILITY.relay)).toBeUndefined();
    expect(registry.unregister(HOST_CAPABILITY.relay)).toBe(false);
  });

  test("rejects invalid endpoint URLs", () => {
    const registry = createHostCapabilityRegistry();
    expect(() => registry.register({ id: HOST_CAPABILITY.chat, endpoint: "not-a-url" })).toThrow();
  });

  test("getManifest builds a valid discovery document", () => {
    const registry = createHostCapabilityRegistry();
    registry.register({ id: HOST_CAPABILITY.pool });
    registry.register({
      id: HOST_CAPABILITY.memories,
      endpoint: "https://public.example/memories",
    });

    const manifest = registry.getManifest({ baseUrl: "https://public.example/" });
    const discovery = buildAgentNetDiscovery(manifest);
    expect(discovery.baseUrl).toBe("https://public.example");
    expect(discovery.endpoints).toEqual({
      health: AGENT_NET_HTTP_PATH.health,
      wellKnown: AGENT_NET_HTTP_PATH.wellKnown,
      capabilitiesSelf: AGENT_NET_HTTP_PATH.capabilitiesSelf,
    });
    expect(discovery.capabilities.every((c) => c.supported === true)).toBe(true);
    expect(zAgentNetDiscovery.parse(discovery)).toEqual(discovery);
  });
});
