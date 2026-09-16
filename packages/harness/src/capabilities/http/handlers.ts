import { buildAgentNetDiscovery } from "../discovery.ts";
import type { AgentEffectiveCapabilities } from "../effective.ts";
import type { AgentNetHostManifest } from "../manifest.ts";
import { AGENT_NET_HTTP_PATH } from "./routes.ts";

export type ResolveCapabilityPrincipalResult =
  | { ok: true; agentDid: string }
  | { ok: false; response: Response };

/**
 * Host-injected principal resolution. Implementations may use DID-signed HTTP,
 * Bearer/service auth, reverse-proxy identity headers, or an in-process trust boundary.
 * Return `{ ok: false, response }` to deny (typically 401/403).
 */
export type ResolveCapabilityPrincipal = (
  req: Request,
) => ResolveCapabilityPrincipalResult | Promise<ResolveCapabilityPrincipalResult>;

export type AgentNetCapabilityHttpDeps = {
  getManifest: () => AgentNetHostManifest | Promise<AgentNetHostManifest>;
  resolveAgentCapabilities: (
    agentDid: string,
  ) => AgentEffectiveCapabilities | Promise<AgentEffectiveCapabilities>;
  resolvePrincipal: ResolveCapabilityPrincipal;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      "content-type": "application/json",
      allow: "GET, HEAD",
    },
  });
}

/**
 * Handle `GET /.well-known/agent-net` (public, no auth).
 */
export async function handleAgentNetWellKnown(
  req: Request,
  deps: Pick<AgentNetCapabilityHttpDeps, "getManifest">,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed();
  const manifest = await deps.getManifest();
  const discovery = buildAgentNetDiscovery(manifest);
  if (req.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return json(discovery);
}

/**
 * Handle `GET /v1/capabilities/self` for the authenticated caller only.
 */
export async function handleAgentNetCapabilitiesSelf(
  req: Request,
  deps: AgentNetCapabilityHttpDeps,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed();
  const principal = await deps.resolvePrincipal(req);
  if (!principal.ok) return principal.response;
  const effective = await deps.resolveAgentCapabilities(principal.agentDid);
  if (req.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return json(effective);
}

/**
 * Handle `GET /health` for the capability HTTP surface.
 */
export function handleAgentNetHealth(req: Request): Response {
  if (req.method !== "GET" && req.method !== "HEAD") return methodNotAllowed();
  if (req.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return json({ ok: true });
}

/**
 * Dispatch capability HTTP routes. Returns `undefined` when the path is not owned
 * by this module so hosts can fall through to other handlers.
 */
export async function dispatchAgentNetCapabilityRequest(
  req: Request,
  deps: AgentNetCapabilityHttpDeps,
): Promise<Response | undefined> {
  const pathname = new URL(req.url).pathname;
  if (pathname === AGENT_NET_HTTP_PATH.wellKnown) {
    return handleAgentNetWellKnown(req, deps);
  }
  if (pathname === AGENT_NET_HTTP_PATH.capabilitiesSelf) {
    return handleAgentNetCapabilitiesSelf(req, deps);
  }
  if (pathname === AGENT_NET_HTTP_PATH.health) {
    return handleAgentNetHealth(req);
  }
  return undefined;
}
