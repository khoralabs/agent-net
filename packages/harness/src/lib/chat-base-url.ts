/** Resolve remote chat-http service URL from common env vars. */
export function resolveChatBaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of ["CHAT_SERVICE_URL", "HARNESS_CHAT_BASE_URL", "CHAT_BASE_URL"] as const) {
    const v = env[key]?.trim();
    if (v !== undefined && v.length > 0) return v.replace(/\/$/, "");
  }
  return undefined;
}

export function requireChatBaseUrl(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = resolveChatBaseUrlFromEnv(env);
  const url = explicit?.trim().replace(/\/$/, "") || fromEnv;
  if (url === undefined || url.length === 0) {
    throw new Error(
      "Chat base URL is required (pass chatBaseUrl or set CHAT_SERVICE_URL / HARNESS_CHAT_BASE_URL / CHAT_BASE_URL)",
    );
  }
  return url;
}

export function resolveChatTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.CHAT_INTERNAL_TOKEN?.trim();
  if (value !== undefined && value.length > 0) return value;
  return undefined;
}

export function requireChatToken(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const token = explicit?.trim() || resolveChatTokenFromEnv(env);
  if (token === undefined || token.length === 0) {
    throw new Error("Chat token is required (pass chatToken or set CHAT_INTERNAL_TOKEN)");
  }
  return token;
}
