import {
  AGENT_NET_HTTP_PATH,
  createAllowAllEntitlementResolver,
  createHostCapabilitiesFacade,
  createHostCapabilityRegistry,
  dispatchAgentNetCapabilityRequest,
  HOST_CAPABILITY,
  type HostCapabilitiesFacade,
} from "@khoralabs/agent-net/capabilities";

export type AgentNetCapabilitiesServiceOptions = {
  port?: number;
  /** Public base URL override; defaults to the listening address. */
  baseUrl?: string;
  services: {
    khoraBaseUrl: string;
    memoriesBaseUrl: string;
    relayBaseUrl: string;
    chatBaseUrl: string;
  };
};

export type AgentNetCapabilitiesServiceHandle = {
  readonly port: number;
  readonly baseUrl: string;
  readonly capabilities: HostCapabilitiesFacade;
  stop(): void;
};

function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function registerReferenceCapabilities(
  registry: ReturnType<typeof createHostCapabilityRegistry>,
  services: AgentNetCapabilitiesServiceOptions["services"],
): void {
  const khora = stripTrailingSlash(services.khoraBaseUrl);
  const memories = stripTrailingSlash(services.memoriesBaseUrl);
  const relay = stripTrailingSlash(services.relayBaseUrl);
  const chat = stripTrailingSlash(services.chatBaseUrl);

  registry.register({
    id: HOST_CAPABILITY.pool,
    description: "Custodial agent DID pool",
    version: "1",
  });
  registry.register({
    id: HOST_CAPABILITY.khora,
    description: "Khora social network host",
    version: "1",
    endpoint: khora,
  });
  registry.register({
    id: HOST_CAPABILITY.memories,
    description: "Memories service",
    version: "1",
    endpoint: memories,
  });
  registry.register({
    id: HOST_CAPABILITY.relay,
    description: "Relay transport",
    version: "1",
    endpoint: relay,
  });
  registry.register({
    id: HOST_CAPABILITY.chat,
    description: "Signed chat HTTP service",
    version: "1",
    endpoint: chat,
  });
  registry.register({
    id: HOST_CAPABILITY.negotiate,
    description: "NBC negotiation over relay (host-composed)",
    version: "1",
  });
}

/**
 * Reference capability discovery HTTP surface.
 * Publishes `GET /.well-known/agent-net` for the currently wired stack.
 * `/v1/capabilities/self` is mounted but denies until a host injects a real principal resolver.
 */
export function startAgentNetCapabilitiesService(
  opts: AgentNetCapabilitiesServiceOptions,
): AgentNetCapabilitiesServiceHandle {
  const registry = createHostCapabilityRegistry();
  registerReferenceCapabilities(registry, opts.services);

  const state = {
    baseUrl: stripTrailingSlash(opts.baseUrl?.trim() || "http://127.0.0.1:0"),
  };

  const entitlementResolver = createAllowAllEntitlementResolver({
    capabilityIds: () => registry.list().map((c) => c.id),
  });

  const server = Bun.serve({
    port: opts.port ?? 0,
    async fetch(req) {
      const facade = createHostCapabilitiesFacade({
        registry,
        baseUrl: state.baseUrl,
        entitlementResolver,
      });
      const res = await dispatchAgentNetCapabilityRequest(req, {
        getManifest: () => facade.getManifest(),
        resolveAgentCapabilities: (did) => facade.resolveAgentCapabilities(did),
        resolvePrincipal: async () => ({
          ok: false as const,
          response: Response.json(
            {
              error:
                "Principal resolution is not configured on the reference capability service. Mount dispatchAgentNetCapabilityRequest with your host auth.",
            },
            { status: 401 },
          ),
        }),
      });
      return res ?? new Response("Not found", { status: 404 });
    },
  });

  const port = server.port ?? opts.port ?? 0;
  state.baseUrl = stripTrailingSlash(opts.baseUrl?.trim() || `http://127.0.0.1:${port}`);

  const capabilities = createHostCapabilitiesFacade({
    registry,
    baseUrl: state.baseUrl,
    entitlementResolver,
  });

  return {
    port,
    baseUrl: state.baseUrl,
    capabilities,
    stop() {
      server.stop(true);
    },
  };
}

export { AGENT_NET_HTTP_PATH };
