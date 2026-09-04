/**
 * Host-owned Khora operator invite mint. Agent-net takes `mintInvite` as a
 * capability, so the Khora route lives here rather than in the harness.
 */
const MINT_PATH = "/v1/ops/invites/mint";

export type MintKhoraInviteOptions = {
  baseUrl: string;
  adminToken: string;
  /** Defaults to 1; the server clamps to 1..10. */
  count?: number;
};

export function resolveKhoraAdminTokenFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of [
    "KHORA_ADMIN_TOKEN",
    "ADMIN_ROOT_TOKEN",
    "KHORA_CONSOLE_ROOT_TOKEN",
  ] as const) {
    const value = env[key]?.trim();
    if (value !== undefined && value.length > 0) return value;
  }
  return undefined;
}

/** Mint invite tokens via `POST /v1/ops/invites/mint` with a Bearer operator token. */
export async function mintKhoraInviteTokens(opts: MintKhoraInviteOptions): Promise<string[]> {
  const baseUrl = opts.baseUrl.trim().replace(/\/$/, "");
  if (baseUrl.length === 0) {
    throw new Error("mintKhoraInviteTokens: baseUrl is required");
  }
  const adminToken = opts.adminToken.trim();
  if (adminToken.length === 0) {
    throw new Error("mintKhoraInviteTokens: adminToken is required");
  }

  const res = await fetch(`${baseUrl}${MINT_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ count: opts.count ?? 1 }),
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

  const tokens =
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { tokens?: unknown }).tokens)
      ? (body as { tokens: unknown[] }).tokens
          .filter((token): token is string => typeof token === "string")
          .map((token) => token.trim())
          .filter((token) => token.length > 0)
      : undefined;

  if (tokens === undefined) {
    throw new Error("mintKhoraInviteTokens: response missing tokens[]");
  }
  if (tokens.length === 0) {
    throw new Error("mintKhoraInviteTokens: server returned no tokens");
  }
  return tokens;
}

/**
 * Build the `mintInvite` capability for `startNetworkHarness`, or `undefined`
 * when no operator token is configured (agents then register without invites).
 */
export function resolveKhoraMintInvite(input: {
  khoraBaseUrl: string;
  adminToken?: string;
  env?: NodeJS.ProcessEnv;
}): (() => Promise<string>) | undefined {
  const adminToken = input.adminToken?.trim() || resolveKhoraAdminTokenFromEnv(input.env);
  if (adminToken === undefined || adminToken.length === 0) return undefined;

  return async () => {
    const [token] = await mintKhoraInviteTokens({
      baseUrl: input.khoraBaseUrl,
      adminToken,
      count: 1,
    });
    if (token === undefined) {
      throw new Error("resolveKhoraMintInvite: mint returned no token");
    }
    return token;
  };
}
