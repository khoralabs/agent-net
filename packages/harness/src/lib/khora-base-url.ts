/** Resolve remote Khora host URL from common env vars. */
export function resolveKhoraBaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of ["KHORA_SERVER_URL", "HARNESS_KHORA_BASE_URL", "KHORA_BASE_URL"] as const) {
    const v = env[key]?.trim();
    if (v !== undefined && v.length > 0) return v.replace(/\/$/, "");
  }
  return undefined;
}

export function requireKhoraBaseUrl(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = resolveKhoraBaseUrlFromEnv(env);
  const url = explicit?.trim().replace(/\/$/, "") || fromEnv;
  if (url === undefined || url.length === 0) {
    throw new Error(
      "Khora base URL is required (pass khoraBaseUrl or set KHORA_BASE_URL / HARNESS_KHORA_BASE_URL / KHORA_SERVER_URL)",
    );
  }
  return url;
}
