export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

/** Default catalog cache TTL (1 hour). */
export const GATEWAY_MODELS_CACHE_TTL_MS = 60 * 60 * 1000;

export type ResponseModelCapabilities = {
  modelId: string;
  /** Gateway tags includes "reasoning" or supported_parameters includes "reasoning". */
  supportsReasoning: boolean;
  /** From Gateway max_tokens when present. */
  maxOutputTokens: number | null;
  /** True when catalog lookup failed or model id missing — treat as unknown. */
  unknown: boolean;
};

export type GatewayModelCatalogEntry = {
  id: string;
  tags?: string[];
  supported_parameters?: string[];
  max_tokens?: number;
};

type CatalogCache = {
  fetchedAt: number;
  byId: Map<string, GatewayModelCatalogEntry>;
};

let catalogCache: CatalogCache | null = null;

export type GatewayModelsFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type ResolveResponseModelCapabilitiesOptions = {
  fetchFn?: GatewayModelsFetch;
  nowMs?: () => number;
  cacheTtlMs?: number;
  /** When set, skip network and use this catalog (tests). */
  catalog?: readonly GatewayModelCatalogEntry[];
};

/** Reset process cache (tests). */
export function clearGatewayModelCatalogCache(): void {
  catalogCache = null;
}

export function capabilitiesFromGatewayEntry(
  modelId: string,
  entry: GatewayModelCatalogEntry | undefined,
): ResponseModelCapabilities {
  const id = modelId.trim();
  if (entry === undefined) {
    return {
      modelId: id,
      supportsReasoning: true,
      maxOutputTokens: null,
      unknown: true,
    };
  }
  const tags = entry.tags ?? [];
  const params = entry.supported_parameters ?? [];
  const supportsReasoning = tags.includes("reasoning") || params.includes("reasoning");
  const max =
    typeof entry.max_tokens === "number" && Number.isFinite(entry.max_tokens)
      ? entry.max_tokens
      : null;
  return {
    modelId: id,
    supportsReasoning,
    maxOutputTokens: max,
    unknown: false,
  };
}

export function parseGatewayModelsResponse(payload: unknown): GatewayModelCatalogEntry[] {
  if (payload === null || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: GatewayModelCatalogEntry[] = [];
  for (const item of data) {
    if (item === null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.trim().length === 0) continue;
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((t): t is string => typeof t === "string")
      : undefined;
    const supported_parameters = Array.isArray(row.supported_parameters)
      ? row.supported_parameters.filter((t): t is string => typeof t === "string")
      : undefined;
    const max_tokens = typeof row.max_tokens === "number" ? row.max_tokens : undefined;
    out.push({
      id: row.id,
      ...(tags !== undefined ? { tags } : {}),
      ...(supported_parameters !== undefined ? { supported_parameters } : {}),
      ...(max_tokens !== undefined ? { max_tokens } : {}),
    });
  }
  return out;
}

function catalogToMap(
  entries: readonly GatewayModelCatalogEntry[],
): Map<string, GatewayModelCatalogEntry> {
  const byId = new Map<string, GatewayModelCatalogEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return byId;
}

async function loadCatalog(
  options: ResolveResponseModelCapabilitiesOptions,
): Promise<Map<string, GatewayModelCatalogEntry>> {
  if (options.catalog !== undefined) {
    return catalogToMap(options.catalog);
  }

  const now = options.nowMs?.() ?? Date.now();
  const ttl = options.cacheTtlMs ?? GATEWAY_MODELS_CACHE_TTL_MS;
  if (catalogCache !== null && now - catalogCache.fetchedAt < ttl) {
    return catalogCache.byId;
  }

  const runFetch = options.fetchFn ?? fetch;
  const res = await runFetch(GATEWAY_MODELS_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`AI Gateway models fetch failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  const entries = parseGatewayModelsResponse(json);
  catalogCache = { fetchedAt: now, byId: catalogToMap(entries) };
  return catalogCache.byId;
}

/**
 * Resolve response-model capabilities from AI Gateway `/v1/models`.
 * On fetch/lookup failure: optimistic `supportsReasoning: true` + `unknown: true`.
 */
export async function resolveResponseModelCapabilities(
  modelId: string,
  options: ResolveResponseModelCapabilitiesOptions = {},
): Promise<ResponseModelCapabilities> {
  const id = modelId.trim();
  if (id.length === 0) {
    return {
      modelId: "",
      supportsReasoning: true,
      maxOutputTokens: null,
      unknown: true,
    };
  }

  try {
    const byId = await loadCatalog(options);
    return capabilitiesFromGatewayEntry(id, byId.get(id));
  } catch {
    return {
      modelId: id,
      supportsReasoning: true,
      maxOutputTokens: null,
      unknown: true,
    };
  }
}
