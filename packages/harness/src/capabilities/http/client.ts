import { type AgentEffectiveCapabilities, zAgentEffectiveCapabilities } from "../effective.ts";
import { type AgentNetDiscovery, zAgentNetDiscovery } from "../manifest.ts";
import { AGENT_NET_HTTP_PATH } from "./routes.ts";

/** Minimal fetch used by discovery clients (string URL only). */
export type AgentNetFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type DiscoverAgentNetOptions = {
  baseUrl: string;
  fetch?: AgentNetFetch;
};

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) {
    throw new Error("discoverAgentNet: baseUrl is required");
  }
  return trimmed;
}

/**
 * Fetch and validate `GET /.well-known/agent-net`.
 */
export async function discoverAgentNet(opts: DiscoverAgentNetOptions): Promise<AgentNetDiscovery> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const fetchFn = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const res = await fetchFn(`${baseUrl}${AGENT_NET_HTTP_PATH.wellKnown}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`discoverAgentNet: ${res.status} ${res.statusText}`);
  }
  return zAgentNetDiscovery.parse(await res.json());
}

export type FetchAgentCapabilitiesSelfOptions = {
  baseUrl: string;
  /**
   * Headers that authenticate the calling agent (DID signature headers, Bearer, etc.).
   * The client does not interpret them; the host principal resolver does.
   */
  headers?: Record<string, string>;
  fetch?: AgentNetFetch;
};

/**
 * Fetch and validate `GET /v1/capabilities/self` for the authenticated caller.
 */
export async function fetchAgentCapabilitiesSelf(
  opts: FetchAgentCapabilitiesSelfOptions,
): Promise<AgentEffectiveCapabilities> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const fetchFn = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const res = await fetchFn(`${baseUrl}${AGENT_NET_HTTP_PATH.capabilitiesSelf}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`fetchAgentCapabilitiesSelf: ${res.status} ${res.statusText}`);
  }
  return zAgentEffectiveCapabilities.parse(await res.json());
}
