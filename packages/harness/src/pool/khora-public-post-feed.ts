import {
  KHORA_HTTP_PATH,
  type PublicPostFeedListResponse,
  type PublicPostFeedNewerCountResponse,
  zPublicPostFeedListResponse,
  zPublicPostFeedNewerCountResponse,
} from "@khoralabs/khora-client";

export type KhoraPublicPostFeedListParams = {
  limit?: number;
  cursor?: string;
  authorDid?: string;
  /** AND semantics; each tag becomes a repeated `tag` query param. */
  tags?: string[];
};

export type KhoraPublicPostFeedNewerCountParams = {
  afterMs: number;
  authorDid?: string;
  tags?: string[];
};

export type KhoraPublicPostFeed = {
  list(params?: KhoraPublicPostFeedListParams): Promise<PublicPostFeedListResponse>;
  newerCount(
    params: KhoraPublicPostFeedNewerCountParams,
  ): Promise<PublicPostFeedNewerCountResponse>;
};

export type CreateKhoraPublicPostFeedOptions = {
  baseUrl: string;
  adminToken: string;
  /** Override fetch (tests). */
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>;
};

export class KhoraPublicPostFeedError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = "KhoraPublicPostFeedError";
    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.code !== undefined) this.code = opts.code;
  }
}

function appendTags(params: URLSearchParams, tags: string[] | undefined): void {
  if (tags === undefined) return;
  for (const tag of tags) {
    params.append("tag", tag);
  }
}

function listQuery(params: KhoraPublicPostFeedListParams | undefined): string {
  const out = new URLSearchParams();
  if (params?.limit !== undefined) out.set("limit", String(params.limit));
  if (params?.cursor !== undefined && params.cursor.length > 0) {
    out.set("cursor", params.cursor);
  }
  if (params?.authorDid !== undefined && params.authorDid.length > 0) {
    out.set("authorDid", params.authorDid);
  }
  appendTags(out, params?.tags);
  const qs = out.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

function newerCountQuery(params: KhoraPublicPostFeedNewerCountParams): string {
  const out = new URLSearchParams();
  out.set("afterMs", String(params.afterMs));
  if (params.authorDid !== undefined && params.authorDid.length > 0) {
    out.set("authorDid", params.authorDid);
  }
  appendTags(out, params.tags);
  return `?${out.toString()}`;
}

async function getJson(
  opts: CreateKhoraPublicPostFeedOptions,
  pathWithQuery: string,
): Promise<unknown> {
  const baseUrl = opts.baseUrl.trim().replace(/\/$/, "");
  if (baseUrl.length === 0) {
    throw new KhoraPublicPostFeedError("createKhoraPublicPostFeed: baseUrl is required");
  }
  const adminToken = opts.adminToken.trim();
  if (adminToken.length === 0) {
    throw new KhoraPublicPostFeedError("createKhoraPublicPostFeed: adminToken is required");
  }
  const fetchFn = opts.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}${pathWithQuery}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Accept: "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new KhoraPublicPostFeedError(`Khora public feed unreachable: ${message}`);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new KhoraPublicPostFeedError(
      `Khora public feed response is not JSON${text.length > 0 ? `: ${text.slice(0, 200)}` : ""}`,
      { status: res.status },
    );
  }

  if (!res.ok) {
    const code =
      body !== null &&
      typeof body === "object" &&
      "code" in body &&
      typeof (body as { code: unknown }).code === "string"
        ? (body as { code: string }).code
        : undefined;
    const errorMessage =
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Khora public feed failed: ${res.status} ${res.statusText}`;
    throw new KhoraPublicPostFeedError(errorMessage, {
      status: res.status,
      ...(code !== undefined ? { code } : {}),
    });
  }

  return body;
}

/**
 * Typed admin client for Khora's catalog-backed public post feed
 * (`GET /v1/ops/posts` and `/v1/ops/posts/newer-count`).
 */
export function createKhoraPublicPostFeed(
  opts: CreateKhoraPublicPostFeedOptions,
): KhoraPublicPostFeed {
  return {
    async list(params) {
      const body = await getJson(opts, `${KHORA_HTTP_PATH.opsPosts}${listQuery(params)}`);
      const parsed = zPublicPostFeedListResponse.safeParse(body);
      if (!parsed.success) {
        throw new KhoraPublicPostFeedError(
          `Khora public feed list response invalid: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },
    async newerCount(params) {
      const body = await getJson(
        opts,
        `${KHORA_HTTP_PATH.opsPostsNewerCount}${newerCountQuery(params)}`,
      );
      const parsed = zPublicPostFeedNewerCountResponse.safeParse(body);
      if (!parsed.success) {
        throw new KhoraPublicPostFeedError(
          `Khora public feed newer-count response invalid: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    },
  };
}
