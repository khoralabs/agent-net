/** Resolve remote relay host URL from common env vars. */
export function resolveRelayBaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of ["RELAY_BASE_URL", "HARNESS_RELAY_BASE_URL", "RELAY_SERVER_URL"] as const) {
    const v = env[key]?.trim();
    if (v !== undefined && v.length > 0) return v.replace(/\/$/, "");
  }
  return undefined;
}

export function requireRelayBaseUrl(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = resolveRelayBaseUrlFromEnv(env);
  const url = explicit?.trim().replace(/\/$/, "") || fromEnv;
  if (url === undefined || url.length === 0) {
    throw new Error(
      "Relay base URL is required (pass relayBaseUrl or set RELAY_BASE_URL / HARNESS_RELAY_BASE_URL / RELAY_SERVER_URL)",
    );
  }
  return url;
}
