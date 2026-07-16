export type MintKhoraInviteTokensOptions = {
  baseUrl: string;
  adminToken: string;
  /** Defaults to 1; server clamps to 1..10. */
  count?: number;
};

/**
 * Mint invite tokens via Khora host admin API:
 * `POST /admin/api/invites/mint` with Bearer admin token.
 */
export async function mintKhoraInviteTokens(opts: MintKhoraInviteTokensOptions): Promise<string[]> {
  const baseUrl = opts.baseUrl.trim().replace(/\/$/, "");
  if (baseUrl.length === 0) {
    throw new Error("mintKhoraInviteTokens: baseUrl is required");
  }
  const adminToken = opts.adminToken.trim();
  if (adminToken.length === 0) {
    throw new Error("mintKhoraInviteTokens: adminToken is required");
  }
  const count = opts.count ?? 1;

  const res = await fetch(`${baseUrl}/admin/api/invites/mint`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ count }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `mintKhoraInviteTokens: ${res.status} ${res.statusText}${text.length > 0 ? `: ${text}` : ""}`,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new Error("mintKhoraInviteTokens: response is not JSON");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("tokens" in body) ||
    !Array.isArray((body as { tokens: unknown }).tokens)
  ) {
    throw new Error("mintKhoraInviteTokens: response missing tokens[]");
  }

  const tokens = (body as { tokens: unknown[] }).tokens
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    throw new Error("mintKhoraInviteTokens: server returned no tokens");
  }
  return tokens;
}

export function resolveKhoraAdminTokenFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of [
    "KHORA_ADMIN_TOKEN",
    "ADMIN_ROOT_TOKEN",
    "KHORA_CONSOLE_ROOT_TOKEN",
  ] as const) {
    const v = env[key]?.trim();
    if (v !== undefined && v.length > 0) return v;
  }
  return undefined;
}

export function requireKhoraAdminToken(
  explicit: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const token = explicit?.trim() || resolveKhoraAdminTokenFromEnv(env);
  if (token === undefined || token.length === 0) {
    throw new Error(
      "Khora admin token is required (pass khoraAdminToken or set KHORA_ADMIN_TOKEN / ADMIN_ROOT_TOKEN / KHORA_CONSOLE_ROOT_TOKEN)",
    );
  }
  return token;
}
