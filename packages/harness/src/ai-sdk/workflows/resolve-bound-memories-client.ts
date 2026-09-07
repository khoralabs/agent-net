import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import {
  type AgentMemoriesOntology,
  minimalAgentMemoriesOntology,
} from "@khoralabs/memories-service/client/agent";
import { getInstalledMemoriesOntology } from "../../agent/memories/tools/_helpers/memories-ontology-install.ts";
import {
  createAgentMemoriesClientForAgent,
  resolveMemoriesServiceAdminToken,
  resolveMemoriesServiceBaseUrl,
} from "../../agent/turn/tools/_helpers/toolkit-env.ts";
import { getNetworkSession } from "../../pool/network/session-registry.ts";

export type ResolveBoundMemoriesClientInput = {
  agentDid: string;
  /** Network session id when deps were bound via harness/session store. */
  sessionId?: string;
  /**
   * When true (default), fall back to Bearer admin-token adapters if no network
   * session is registered for `sessionId` (or `sessionId` is omitted).
   * A registered session never falls through to env tokens.
   */
  allowBearerFallback?: boolean;
  /**
   * When true, Bearer fallback may use {@link minimalAgentMemoriesOntology}
   * if none is installed. NBC paths leave this false (ontology required).
   */
  allowMinimalOntology?: boolean;
};

/**
 * Resolve a per-agent memories client without requiring callers to hold a
 * memories credential. Prefer the network-session bound client; optionally
 * fall back to host Bearer adapters for unbound / legacy paths.
 */
export async function resolveBoundAgentMemoriesClient(
  input: ResolveBoundMemoriesClientInput,
): Promise<RemoteMemoriesClientAsync> {
  const sessionId = input.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    const session = getNetworkSession(sessionId);
    if (session !== undefined) {
      const deps = await session.resolveAgentWorkflowDeps(input.agentDid);
      const client = deps.memoriesClient;
      if (client === undefined || client === null) {
        throw new Error(
          `network session ${sessionId} has no memoriesClient for agent ${input.agentDid}`,
        );
      }
      return client as RemoteMemoriesClientAsync;
    }
    if (input.allowBearerFallback === false) {
      throw new Error(`network session ${sessionId} is not active`);
    }
    return createBearerAgentMemoriesClient(input.agentDid, {
      allowMinimalOntology: input.allowMinimalOntology === true,
    });
  }

  if (input.allowBearerFallback === false) {
    throw new Error("sessionId is required when Bearer memories fallback is disabled");
  }

  return createBearerAgentMemoriesClient(input.agentDid, {
    allowMinimalOntology: input.allowMinimalOntology === true,
  });
}

/** True when a network session is registered (does not resolve deps). */
export function hasBoundNetworkSession(sessionId: string | undefined): boolean {
  const id = sessionId?.trim();
  if (id === undefined || id.length === 0) return false;
  return getNetworkSession(id) !== undefined;
}

/** Soft-skip signal: memories simply are not configured for this host. */
export function isOptionalMemoriesUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("MEMORIES_SERVICE_ADMIN_TOKEN is required") ||
    message.includes("memories ontology is not installed")
  );
}

async function createBearerAgentMemoriesClient(
  agentDid: string,
  opts: { allowMinimalOntology: boolean },
): Promise<RemoteMemoriesClientAsync> {
  const memoriesBaseUrl = resolveMemoriesServiceBaseUrl() || "http://127.0.0.1:8791";
  const memoriesAdminToken = resolveMemoriesServiceAdminToken();
  if (memoriesAdminToken === undefined || memoriesAdminToken.length === 0) {
    throw new Error("MEMORIES_SERVICE_ADMIN_TOKEN is required");
  }
  const ontology: AgentMemoriesOntology | undefined =
    getInstalledMemoriesOntology() ??
    (opts.allowMinimalOntology ? minimalAgentMemoriesOntology : undefined);
  if (ontology === undefined) {
    throw new Error("memories ontology is not installed");
  }
  return createAgentMemoriesClientForAgent({
    baseUrl: memoriesBaseUrl,
    agentDid,
    ontology,
    adminToken: memoriesAdminToken,
  });
}
