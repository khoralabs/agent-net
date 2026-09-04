import { CHAT_HTTP_PATH } from "@khoralabs/chat/http";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-client";
import { MEMORIES_HTTP_PATH } from "@khoralabs/memories-service/http/contracts";
import { RELAY_HTTP_PATH } from "@khoralabs/relay/contracts";

async function requireServiceHealth(
  label: string,
  baseUrl: string,
  healthPath: string,
  hint: string,
): Promise<void> {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}${healthPath}`;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) {
      throw new Error(`${label} health returned ${res.status}`);
    }
    // Accept JSON health bodies (`{ ok: true }` or `{ ok: true, version: N }`) or empty OK.
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      const body = (await res.json()) as { ok?: unknown; version?: unknown };
      if (body.ok !== true) {
        throw new Error(`${label} health JSON missing ok: true`);
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} at ${baseUrl} is not reachable (${detail}). ${hint}`);
  }
}

/** Fail fast when local memories/relay/chat from .env are not up (orchestrator not running). */
export async function requireReferenceStackReachable(input: {
  memoriesBaseUrl: string;
  relayBaseUrl: string;
  chatBaseUrl: string;
}): Promise<void> {
  const hint = "Start the orchestrator in another terminal: bun run start";
  await requireServiceHealth(
    "Reference memories",
    input.memoriesBaseUrl,
    MEMORIES_HTTP_PATH.health,
    hint,
  );
  await requireServiceHealth("Reference relay", input.relayBaseUrl, RELAY_HTTP_PATH.health, hint);
  await requireServiceHealth("Reference chat", input.chatBaseUrl, CHAT_HTTP_PATH.health, hint);
}

/** Khora is started by the reference orchestrator (default :8788). */
export async function requireKhoraReachable(khoraBaseUrl: string): Promise<void> {
  await requireServiceHealth(
    "Khora",
    khoraBaseUrl,
    KHORA_HTTP_PATH.health,
    "Start the orchestrator in another terminal: bun run start",
  );
}
