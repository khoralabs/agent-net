import { describe, expect, test } from "bun:test";
import { createAllowAllEntitlementResolver } from "../entitlement.ts";
import { createHostCapabilitiesFacade } from "../facade.ts";
import { HOST_CAPABILITY } from "../ids.ts";
import { createHostCapabilityRegistry } from "../registry.ts";
import { discoverAgentNet, fetchAgentCapabilitiesSelf } from "./client.ts";
import { dispatchAgentNetCapabilityRequest, type ResolveCapabilityPrincipal } from "./handlers.ts";
import { AGENT_NET_HTTP_PATH } from "./routes.ts";

function createTestFacade() {
  const registry = createHostCapabilityRegistry();
  registry.register({
    id: HOST_CAPABILITY.chat,
    description: "Signed chat",
    endpoint: "https://public.example/chat",
  });
  registry.register({ id: HOST_CAPABILITY.khora, availability: "degraded" });
  return createHostCapabilitiesFacade({
    registry,
    baseUrl: "https://public.example",
    entitlementResolver: createAllowAllEntitlementResolver({
      capabilityIds: () => registry.list().map((c) => c.id),
    }),
  });
}

function principalFromHeader(req: Request): ReturnType<ResolveCapabilityPrincipal> {
  const did = req.headers.get("x-agent-did")?.trim();
  if (did === undefined || did.length === 0) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, agentDid: did };
}

describe("agent-net capability HTTP", () => {
  test("well-known is public and omits credentials", async () => {
    const facade = createTestFacade();
    const res = await dispatchAgentNetCapabilityRequest(
      new Request(`https://public.example${AGENT_NET_HTTP_PATH.wellKnown}`),
      {
        getManifest: () => facade.getManifest(),
        resolveAgentCapabilities: (did) => facade.resolveAgentCapabilities(did),
        resolvePrincipal: principalFromHeader,
      },
    );
    expect(res).toBeDefined();
    if (res === undefined) return;
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version).toBe(1);
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("did:key");
  });

  test("capabilities/self requires principal and returns effective set", async () => {
    const facade = createTestFacade();
    const deps = {
      getManifest: () => facade.getManifest(),
      resolveAgentCapabilities: (did: string) => facade.resolveAgentCapabilities(did),
      resolvePrincipal: principalFromHeader,
    };

    const denied = await dispatchAgentNetCapabilityRequest(
      new Request(`https://public.example${AGENT_NET_HTTP_PATH.capabilitiesSelf}`),
      deps,
    );
    expect(denied?.status).toBe(401);

    const ok = await dispatchAgentNetCapabilityRequest(
      new Request(`https://public.example${AGENT_NET_HTTP_PATH.capabilitiesSelf}`, {
        headers: { "x-agent-did": "did:key:agent" },
      }),
      deps,
    );
    expect(ok).toBeDefined();
    if (ok === undefined) return;
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { agentDid: string; capabilities: unknown[] };
    expect(body.agentDid).toBe("did:key:agent");
    expect(body.capabilities.length).toBeGreaterThan(0);
  });

  test("unknown paths return undefined; wrong methods 405 with Allow", async () => {
    const facade = createTestFacade();
    const deps = {
      getManifest: () => facade.getManifest(),
      resolveAgentCapabilities: (did: string) => facade.resolveAgentCapabilities(did),
      resolvePrincipal: principalFromHeader,
    };
    expect(
      await dispatchAgentNetCapabilityRequest(new Request("https://public.example/other"), deps),
    ).toBeUndefined();

    const res = await dispatchAgentNetCapabilityRequest(
      new Request(`https://public.example${AGENT_NET_HTTP_PATH.wellKnown}`, { method: "POST" }),
      deps,
    );
    expect(res?.status).toBe(405);
    expect(res?.headers.get("allow")).toBe("GET, HEAD");
  });

  test("health and HEAD routes", async () => {
    const facade = createTestFacade();
    const deps = {
      getManifest: () => facade.getManifest(),
      resolveAgentCapabilities: (did: string) => facade.resolveAgentCapabilities(did),
      resolvePrincipal: principalFromHeader,
    };

    const health = await dispatchAgentNetCapabilityRequest(
      new Request(`https://public.example${AGENT_NET_HTTP_PATH.health}`),
      deps,
    );
    expect(health).toBeDefined();
    if (health === undefined) return;
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const head = await dispatchAgentNetCapabilityRequest(
      new Request(`https://public.example${AGENT_NET_HTTP_PATH.wellKnown}`, { method: "HEAD" }),
      deps,
    );
    expect(head).toBeDefined();
    if (head === undefined) return;
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  test("discoverAgentNet and fetchAgentCapabilitiesSelf round-trip schemas", async () => {
    const facade = createTestFacade();
    const deps = {
      getManifest: () => facade.getManifest(),
      resolveAgentCapabilities: (did: string) => facade.resolveAgentCapabilities(did),
      resolvePrincipal: principalFromHeader,
    };

    const fetchFn = async (input: string, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init);
      const res = await dispatchAgentNetCapabilityRequest(req, deps);
      return res ?? new Response("not found", { status: 404 });
    };

    const discovery = await discoverAgentNet({
      baseUrl: "https://public.example",
      fetch: fetchFn,
    });
    expect(discovery.endpoints.wellKnown).toBe(AGENT_NET_HTTP_PATH.wellKnown);

    const self = await fetchAgentCapabilitiesSelf({
      baseUrl: "https://public.example",
      headers: { "x-agent-did": "did:key:agent" },
      fetch: fetchFn,
    });
    expect(self.agentDid).toBe("did:key:agent");
  });
});
