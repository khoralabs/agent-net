import {
  type EmbeddingModel,
  type HybridMemorySearchNeighborsOption,
  type MemorySearchHit,
  runHybridMemorySearch,
} from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

/** Namespace subtree search — default for `searchMemories` / graph UI search. */
export const MEMORY_SEARCH_SCOPE_SUBTREE = "pathSubtree" as const;

/** Exact namespace only — used for `_root_/_skills_` catalog search. */
export const MEMORY_SEARCH_SCOPE_EXACT = "exactScope" as const;

export type MemorySearchScopeMode =
  | typeof MEMORY_SEARCH_SCOPE_SUBTREE
  | typeof MEMORY_SEARCH_SCOPE_EXACT;

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
 * Resolve `asOfTimestampMs` for the current provenance head.
 * Same semantics as `runHybridMemorySearch` when given a live head hex.
 */
export async function resolveMemoriesSearchAsOfTimestampMs(
  client: RemoteMemoriesClientAsync,
): Promise<number | undefined> {
  const rootHex = await resolveMemoriesHeadRootHex(client);
  if (rootHex === undefined) return undefined;
  const tsFn = client.persistence.getProvenanceTimestampMsForRootHex;
  if (tsFn === undefined) return undefined;
  const out = tsFn.call(client.persistence, rootHex);
  const ts = await Promise.resolve(out);
  return typeof ts === "number" && Number.isFinite(ts) ? ts : undefined;
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
  maxVectorDistance?: number;
  arms?: { lexical: number; vector: number };
};

/**
 * Hybrid memory search with shared standards:
 * - fresh provenance head `asOf` on every call
 * - default `pathSubtree` scope
 * - default neighbors off
 * - lexical-only arms when no embedding model
 */
export async function runStandardHybridMemorySearch(
  client: RemoteMemoriesClientAsync,
  input: StandardHybridMemorySearchInput,
): Promise<MemorySearchHit[]> {
  const memoriesSnapshotRootHex = await resolveMemoriesHeadRootHex(client);
  const embeddingModel = input.embeddingModel;
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
        ...(input.maxVectorDistance !== undefined
          ? { maxVectorDistance: input.maxVectorDistance }
          : {}),
        arms: input.arms ?? (embeddingModel !== undefined ? undefined : { lexical: 1, vector: 0 }),
      },
    },
  );
}
