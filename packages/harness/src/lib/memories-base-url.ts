/** Resolve remote memories service URL from common env vars. */
export function resolveMemoriesBaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of [
    "MEMORIES_SERVICE_URL",
    "HARNESS_MEMORIES_BASE_URL",
    "MEMORIES_BASE_URL",
  ] as const) {
    const v = env[key]?.trim();
    if (v !== undefined && v.length > 0) return v.replace(/\/$/, "");
  }
  return undefined;
}

export function requireMemoriesBaseUrl(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = resolveMemoriesBaseUrlFromEnv(env);
  const url = explicit?.trim().replace(/\/$/, "") || fromEnv;
  if (url === undefined || url.length === 0) {
    throw new Error(
      "Memories base URL is required (pass memoriesBaseUrl or set MEMORIES_SERVICE_URL / HARNESS_MEMORIES_BASE_URL / MEMORIES_BASE_URL)",
    );
  }
  return url;
}

export function resolveMemoriesAdminTokenFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env.MEMORIES_SERVICE_ADMIN_TOKEN?.trim();
  if (value !== undefined && value.length > 0) return value;
  return undefined;
}

export function requireMemoriesAdminToken(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const token = explicit?.trim() || resolveMemoriesAdminTokenFromEnv(env);
  if (token === undefined || token.length === 0) {
    throw new Error(
      "Memories admin token is required (pass memoriesAdminToken or set MEMORIES_SERVICE_ADMIN_TOKEN)",
    );
  }
  return token;
}
