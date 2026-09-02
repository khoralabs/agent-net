async function requireServiceHealth(label: string, baseUrl: string, hint: string): Promise<void> {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) {
      throw new Error(`${label} health returned ${res.status}`);
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
  await requireServiceHealth(
    "Reference memories",
    input.memoriesBaseUrl,
    "Start the orchestrator in another terminal: bun run start",
  );
  await requireServiceHealth(
    "Reference relay",
    input.relayBaseUrl,
    "Start the orchestrator in another terminal: bun run start",
  );
  await requireServiceHealth(
    "Reference chat",
    input.chatBaseUrl,
    "Start the orchestrator in another terminal: bun run start",
  );
}

/** Khora is started by the reference orchestrator (default :8788). */
export async function requireKhoraReachable(khoraBaseUrl: string): Promise<void> {
  await requireServiceHealth(
    "Khora",
    khoraBaseUrl,
    "Start the orchestrator in another terminal: bun run start",
  );
}
