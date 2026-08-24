import type { SearchAsOf } from "@khoralabs/memories-node";
import {
  type EmbeddingModel,
  type HybridMemorySearchNeighborsOption,
  type MemorySearchHit,
  type NamespaceSearchResult,
  runHybridMemorySearch,
  searchNamespaces,
} from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

/** Namespace subtree search — default for `searchMemories` / graph UI search. */
export const MEMORY_SEARCH_SCOPE_SUBTREE = "pathSubtree" as const;

/** Exact namespace only — used for `_skills_` catalog search. */
export const MEMORY_SEARCH_SCOPE_EXACT = "exactScope" as const;

export type MemorySearchScopeMode =
  | typeof MEMORY_SEARCH_SCOPE_SUBTREE
  | typeof MEMORY_SEARCH_SCOPE_EXACT;

export const EMBEDDING_MODEL_REQUIRED_MESSAGE =
  "AI_GATEWAY_API_KEY is required for hybrid memory search (set it on this service's env)";

/**
 * Current provenance head root hex at call time (not session-cached).
 * Used so hybrid search `asOf` tracks live head on every request.
 */
export async function resolveMemoriesHeadRootHex(
  client: RemoteMemoriesClientAsync,
): Promise<string | undefined> {
  const fn = client.persistence.getProvenanceHeadRootHex;
  if (fn === undefined) return undefined;
  const out = await fn.call(client.persistence);
  const hex = (out ?? "").trim();
  return hex.length > 0 ? hex : undefined;
}

/**
 * Resolve {@link SearchAsOf} for the current provenance head (`{ lte: timestampMs }`).
 * Same semantics as `runHybridMemorySearch` when given a live head hex.
 */
export async function resolveMemoriesSearchAsOf(
  client: RemoteMemoriesClientAsync,
): Promise<SearchAsOf | undefined> {
  const rootHex = await resolveMemoriesHeadRootHex(client);
  if (rootHex === undefined) return undefined;
  const tsFn = client.persistence.getProvenanceTimestampMsForRootHex;
  if (tsFn === undefined) return undefined;
  const out = tsFn.call(client.persistence, rootHex);
  const ts = await Promise.resolve(out);
  return typeof ts === "number" && Number.isFinite(ts) ? { lte: ts } : undefined;
}

export type StandardHybridMemorySearchInput = {
  namespace: string;
  query: string;
  embeddingModel?: EmbeddingModel;
  embeddingCache?: Map<string, number[]>;
  /** Defaults to {@link MEMORY_SEARCH_SCOPE_SUBTREE}. */
  searchScopeMode?: MemorySearchScopeMode;
  topK?: number;
  /** Defaults to `"off"` (agent tool default). */
  neighbors?: HybridMemorySearchNeighborsOption;
  maxNeighbors?: number;
  maxVectorDistance?: number;
  arms?: { lexical: number; vector: number };
  /**
   * When true, throw if `embeddingModel` is missing instead of soft-falling
   * back to lexical-only (empty hits for semantic queries).
   */
  requireEmbedding?: boolean;
};

/**
 * Hybrid memory search with shared standards:
 * - fresh provenance head `asOf` (`{ lte }`) on every call
 * - default `pathSubtree` scope
 * - default neighbors off
 * - lexical-only arms when no embedding model (unless `requireEmbedding`)
 */
export async function runStandardHybridMemorySearch(
  client: RemoteMemoriesClientAsync,
  input: StandardHybridMemorySearchInput,
): Promise<MemorySearchHit[]> {
  const embeddingModel = input.embeddingModel;
  if (input.requireEmbedding === true && embeddingModel === undefined) {
    throw new Error(EMBEDDING_MODEL_REQUIRED_MESSAGE);
  }

  const memoriesSnapshotRootHex = await resolveMemoriesHeadRootHex(client);
  return runHybridMemorySearch(
    client,
    {
      namespace: input.namespace,
      embeddingModel,
      embeddingCache: input.embeddingCache,
      ...(memoriesSnapshotRootHex !== undefined ? { memoriesSnapshotRootHex } : {}),
    },
    {
      content: { text: input.query },
      searchScopeMode: input.searchScopeMode ?? MEMORY_SEARCH_SCOPE_SUBTREE,
      options: {
        topK: input.topK ?? 12,
        neighbors: input.neighbors ?? "off",
        ...(input.maxNeighbors !== undefined ? { maxNeighbors: input.maxNeighbors } : {}),
        ...(input.maxVectorDistance !== undefined
          ? { maxVectorDistance: input.maxVectorDistance }
          : {}),
        arms: input.arms ?? (embeddingModel !== undefined ? undefined : { lexical: 1, vector: 0 }),
      },
    },
  );
}

export type NamespaceSearchArms = {
  nodes?: number;
  lexical?: number;
  vector?: number;
};

/** Namespace hit enriched with catalog alias/description for agent prompts. */
export type EnrichedNamespaceSearchHit = NamespaceSearchResult["namespaces"][number] & {
  alias: string | null;
  description: string;
};

export type EnrichedNamespaceSearchResult = Omit<NamespaceSearchResult, "namespaces"> & {
  namespaces: EnrichedNamespaceSearchHit[];
};

export type StandardNamespaceSearchInput = {
  query: string;
  /** Optional path filter after aggregation (inclusive subtree). */
  under?: string;
  embeddingModel?: EmbeddingModel;
  embeddingCache?: Map<string, number[]>;
  limit?: number;
  /**
   * When true (default), use library default arms (nodes + lexical + vector).
   * When false, lexical-only catalog ranking (`arms.nodes: 0`).
   */
  contentRanking?: boolean;
  /** Explicit arm weights; overrides {@link contentRanking} when set. */
  arms?: NamespaceSearchArms;
  /**
   * When true, throw if `embeddingModel` is missing instead of soft-falling
   * back to lexical-only arms.
   */
  requireEmbedding?: boolean;
};

async function enrichNamespaceSearchHits(
  client: RemoteMemoriesClientAsync,
  result: NamespaceSearchResult,
): Promise<EnrichedNamespaceSearchResult> {
  const withMeta = client.persistence.listNamespacesWithMetadata;
  const metaByNs = new Map<string, { alias: string | null; description: string }>();
  if (withMeta !== undefined) {
    const rows = await withMeta.call(client.persistence);
    for (const row of rows) {
      metaByNs.set(row.namespace, {
        alias: row.alias ?? null,
        description: row.description ?? "",
      });
    }
  }

  return {
    ...result,
    namespaces: result.namespaces.map((hit) => {
      const meta = metaByNs.get(hit.namespace);
      return {
        ...hit,
        alias: meta?.alias ?? null,
        description: meta?.description ?? "",
      };
    }),
  };
}

/**
 * Namespace discovery search with shared standards:
 * - fresh provenance head snapshot on every call
 * - content ranking by default (nodes + lexical + vector when embedding is set)
 * - unscoped when `under` is omitted
 * - hits enriched with alias/description from namespace metadata
 */
export async function runStandardNamespaceSearch(
  client: RemoteMemoriesClientAsync,
  input: StandardNamespaceSearchInput,
): Promise<EnrichedNamespaceSearchResult> {
  const embeddingModel = input.embeddingModel;
  if (input.requireEmbedding === true && embeddingModel === undefined) {
    throw new Error(EMBEDDING_MODEL_REQUIRED_MESSAGE);
  }

  const under = input.under?.trim();
  const namespace = under !== undefined && under.length > 0 ? under : "";
  const memoriesSnapshotRootHex = await resolveMemoriesHeadRootHex(client);

  const arms: NamespaceSearchArms | undefined =
    input.arms ?? (input.contentRanking === false ? { nodes: 0, lexical: 1 } : undefined);

  const result = await searchNamespaces(
    client,
    {
      namespace,
      embeddingModel,
      embeddingCache: input.embeddingCache,
      ...(memoriesSnapshotRootHex !== undefined ? { memoriesSnapshotRootHex } : {}),
    },
    {
      content: { text: input.query },
      ...(under !== undefined && under.length > 0 ? { under } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(arms !== undefined ? { arms } : {}),
    },
  );

  return enrichNamespaceSearchHits(client, result);
}
