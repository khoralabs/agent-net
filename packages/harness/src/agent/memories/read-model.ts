import { ids } from "@khoralabs/memories-node";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import {
  type EnrichedNamespaceSearchResult,
  resolveAgentEmbeddingModel,
  runStandardHybridMemorySearch,
  runStandardNamespaceSearch,
  type StandardHybridMemorySearchInput,
  type StandardNamespaceSearchInput,
} from "@khoralabs/memories-node/helpers/agent";
import type { NamespaceGraphLayout } from "@khoralabs/memories-node/projections";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import {
  createBearerTokenAuthProvider,
  createDeferredRemoteMemoriesClientAsync,
  createRemoteMemoriesReadClient,
  type DatabaseEffectiveSuppressionResponse,
  type DatabaseGraphCountsResponse,
  type DatabaseGraphStatsResponse,
  type DatabaseNamespaceMetadata,
  type DatabaseProvenanceChainResponse,
  type DatabaseProvenanceContentResponse,
  type DatabaseProvenanceEventsResponse,
  MemoriesServiceClient,
  type MemoriesServiceClientAuthProvider,
  type MemoriesServiceFetch,
  type RemoteMemoriesClientAsync,
  type RemoteMemoriesReadClient,
} from "@khoralabs/memories-service/client";
import {
  type AgentMemoriesOntology,
  minimalAgentMemoriesOntology,
  resolveAgentMemoriesOntology,
} from "@khoralabs/memories-service/client/agent";
import { MEMORIES_HTTP_PATH } from "@khoralabs/memories-service/http/contracts";
import type { ResolvedSource } from "@khoralabs/sourcemaps";
import {
  type AgentMemoryEntityMap,
  type AgentMemorySourceRef,
  createAgentMemoryStore,
} from "../turn/agent-memory-source.ts";

type MemorySearchHit = Awaited<ReturnType<typeof runStandardHybridMemorySearch>>[number];
type DatabaseMemoryPreviewResponse = Awaited<
  ReturnType<RemoteMemoriesReadClient["getMemoryPreview"]>
>;
type DatabaseEdgePreviewResponse = Awaited<ReturnType<RemoteMemoriesReadClient["getEdgePreview"]>>;
type DatabaseMemoryDetailResponse = Awaited<
  ReturnType<RemoteMemoriesReadClient["getMemoryDetail"]>
>;
type DatabaseEdgeDetailResponse = Awaited<ReturnType<RemoteMemoriesReadClient["getEdgeDetail"]>>;
type DatabaseProvenanceGraphResponse = Awaited<
  ReturnType<RemoteMemoriesReadClient["getProvenanceGraph"]>
>;
type DatabaseProvenanceVectorsResponse = Awaited<
  ReturnType<RemoteMemoriesReadClient["getProvenanceVectors"]>
>;

const QUALIFIED_MEMORY_KEY_SEP = "::";
const SEARCH_HIT_SNIPPET_MAX = 2400;

export type MemoriesGraphSearchResult = {
  hitCount: number;
  hitKeys: string[];
  neighborKeys: string[];
  keys: string[];
  hitSnippets: Array<{ key: string; sourceKey?: string; text: string | null }>;
  edgeHitSnippets: Array<{
    edgeId: string;
    fromKey?: string;
    toKey?: string;
    text: string | null;
  }>;
};

export type MemoriesGraphSearchInput = {
  namespace: string;
  query: string;
  topK?: number;
  maxNeighbors?: number;
  maxVectorDistance?: number;
  /** Defaults to subtree (pathSubtree), matching host graph search. */
  scope?: "exact" | "subtree";
  embeddingModel?: EmbeddingModel;
  requireEmbedding?: boolean;
};

export type MemoriesReadModel = {
  readonly database: MemoriesDatabaseId;

  listNamespaces(opts?: { includeSuppressed?: boolean }): Promise<DatabaseNamespaceMetadata[]>;
  listNamespacesUnderPrefix(
    prefix: string,
    opts?: { includeSuppressed?: boolean },
  ): Promise<DatabaseNamespaceMetadata[]>;
  namespaceExistsUnderPrefix(
    prefix: string,
    opts?: { includeSuppressed?: boolean },
  ): Promise<boolean>;
  getNamespaceMetadata(namespace: string): Promise<DatabaseNamespaceMetadata | null>;
  getEffectiveSuppression(input: {
    namespace: string;
    key?: string;
  }): Promise<DatabaseEffectiveSuppressionResponse>;

  getGraphLayout(input: {
    namespace: string;
    scope?: "exact" | "subtree";
    includeSuppressed?: boolean;
  }): Promise<NamespaceGraphLayout>;
  getGraphCounts(input: {
    namespace: string;
    scope?: "exact" | "subtree";
    includeSuppressed?: boolean;
  }): Promise<DatabaseGraphCountsResponse>;
  getGraphStats(input: {
    namespace: string;
    scope?: "exact" | "subtree";
    includeSuppressed?: boolean;
  }): Promise<DatabaseGraphStatsResponse>;

  getMemoryPreview(input: {
    namespace: string;
    key: string;
    maxChars?: number;
    rootHex?: string;
    includeAtTip?: boolean;
    includeVectors?: boolean;
  }): Promise<DatabaseMemoryPreviewResponse>;
  getEdgePreview(
    namespace: string,
    edgeId: string,
    opts?: {
      includeSuppressed?: boolean;
      rootHex?: string;
      includeAtTip?: boolean;
      includeVectors?: boolean;
    },
  ): Promise<DatabaseEdgePreviewResponse>;
  getMemoryDetail(input: {
    namespace: string;
    key: string;
    rootHex?: string;
    limit?: number;
    before?: { createdAt: number; id: string };
    includeVectors?: boolean;
    maxChars?: number;
  }): Promise<DatabaseMemoryDetailResponse>;
  getEdgeDetail(input: {
    namespace: string;
    edgeId: string;
    rootHex?: string;
    limit?: number;
    before?: { createdAt: number; id: string };
    includeVectors?: boolean;
    includeSuppressed?: boolean;
  }): Promise<DatabaseEdgeDetailResponse>;

  getProvenanceGraph(input: {
    rootHex: string;
    namespace: string;
    key: string;
  }): Promise<DatabaseProvenanceGraphResponse>;
  getProvenanceVectors(input: {
    rootHex: string;
    namespace: string;
    key: string;
    includeValues?: boolean;
  }): Promise<DatabaseProvenanceVectorsResponse>;
  getSourceMapTextPreview(sourceMapId: string, maxChars?: number): Promise<string | null>;
  getSourceMapText(sourceMapId: string): Promise<string | null>;
  listProvenanceEvents(input?: {
    namespace?: string;
    key?: string;
    edgeId?: string;
    limit?: number;
    before?: { createdAt: number; id: string };
  }): Promise<DatabaseProvenanceEventsResponse["events"]>;
  listProvenanceChain(input?: {
    limit?: number;
    beforeRootHex?: string;
  }): Promise<DatabaseProvenanceChainResponse["links"]>;
  getMemoryContentAtRootHex(input: {
    rootHex: string;
    namespace: string;
    key: string;
  }): Promise<DatabaseProvenanceContentResponse["content"]>;
  getBackendCapabilities(): Promise<Record<string, boolean | undefined>>;

  findMemoryIdByKey(namespace: string, key: string): Promise<string | undefined>;
  loadMemoryNamespaceKey(memoryId: string): Promise<{ namespace: string; key: string } | undefined>;

  /** Raw hybrid record hits (workflow / agent toolkit semantics). */
  searchRecords(
    input: Omit<StandardHybridMemorySearchInput, "embeddingModel"> & {
      embeddingModel?: EmbeddingModel;
    },
  ): Promise<MemorySearchHit[]>;
  /** Host graph search with qualified keys + source-map snippets. */
  searchGraph(input: MemoriesGraphSearchInput): Promise<MemoriesGraphSearchResult>;
  searchNamespaces(input: StandardNamespaceSearchInput): Promise<EnrichedNamespaceSearchResult>;

  resolveMemorySource(ref: AgentMemorySourceRef): Promise<ResolvedSource<AgentMemoryEntityMap>>;
};

export type CreateMemoriesReadModelOptions = {
  baseUrl: string;
  database: MemoriesDatabaseId;
  /** Bearer admin token (typical harness path). */
  adminToken?: string;
  /** Alternate auth provider (e.g. host-signed fetch already attached). */
  auth?: MemoriesServiceClientAuthProvider;
  fetch?: MemoriesServiceFetch;
  /** Ontology for deferred remote client materialization; defaults to agent baseline. */
  ontology?: AgentMemoriesOntology;
  embeddingModel?: EmbeddingModel;
  /** Test seams. */
  reads?: RemoteMemoriesReadClient;
  client?: RemoteMemoriesClientAsync;
  service?: MemoriesServiceClient;
};

export class MemoriesReadModelError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = "MemoriesReadModelError";
    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.code !== undefined) this.code = opts.code;
  }
}

function resolveAuth(opts: CreateMemoriesReadModelOptions): MemoriesServiceClientAuthProvider {
  if (opts.auth !== undefined) return opts.auth;
  const token = opts.adminToken?.trim() ?? "";
  if (token.length === 0) {
    throw new MemoriesReadModelError("createMemoriesReadModel: adminToken or auth is required");
  }
  return createBearerTokenAuthProvider(token);
}

function qualifySearchKey(
  namespace: string,
  memoryKey: string,
  scope: "exact" | "subtree",
): string {
  return scope === "subtree" ? `${namespace}${QUALIFIED_MEMORY_KEY_SEP}${memoryKey}` : memoryKey;
}

/**
 * Read-only Memories facade: database-scoped, credential-capturing, no mutation methods.
 * Composes published `@khoralabs/memories-service` / `@khoralabs/memories-node` clients.
 */
export function createMemoriesReadModel(opts: CreateMemoriesReadModelOptions): MemoriesReadModel {
  const baseUrl = opts.baseUrl.trim().replace(/\/$/, "");
  if (baseUrl.length === 0) {
    throw new MemoriesReadModelError("createMemoriesReadModel: baseUrl is required");
  }
  const auth = resolveAuth(opts);
  const fetch = opts.fetch;
  const ontology =
    opts.ontology !== undefined
      ? resolveAgentMemoriesOntology(opts.ontology)
      : minimalAgentMemoriesOntology;
  const database = opts.database;

  const reads =
    opts.reads ??
    createRemoteMemoriesReadClient({
      baseUrl,
      database,
      auth,
      ...(fetch !== undefined ? { fetch } : {}),
    });
  const service =
    opts.service ??
    new MemoriesServiceClient({
      baseUrl,
      auth,
      ...(fetch !== undefined ? { fetch } : {}),
    });

  const client =
    opts.client ??
    createDeferredRemoteMemoriesClientAsync({
      baseUrl,
      database,
      ontology,
      auth,
      ...(fetch !== undefined ? { fetch } : {}),
    });

  const store = createAgentMemoryStore(client);
  const defaultEmbedding = opts.embeddingModel;

  const model: MemoriesReadModel = {
    database,

    listNamespaces(listOpts) {
      return reads.listNamespaces(listOpts);
    },
    listNamespacesUnderPrefix(prefix, listOpts) {
      return reads.listNamespacesUnderPrefix(prefix, listOpts);
    },
    namespaceExistsUnderPrefix(prefix, listOpts) {
      return reads.namespaceExistsUnderPrefix(prefix, listOpts);
    },
    getNamespaceMetadata(namespace) {
      return reads.getNamespaceMetadata(namespace);
    },
    getEffectiveSuppression(input) {
      return reads.getEffectiveSuppression(input);
    },

    getGraphLayout(input) {
      return reads.getGraphLayout(input);
    },
    getGraphCounts(input) {
      return reads.getGraphCounts(input);
    },
    getGraphStats(input) {
      return reads.getGraphStats(input);
    },

    getMemoryPreview(input) {
      return reads.getMemoryPreview(input);
    },
    getEdgePreview(namespace, edgeId, previewOpts) {
      return reads.getEdgePreview(namespace, edgeId, previewOpts);
    },
    getMemoryDetail(input) {
      return reads.getMemoryDetail(input);
    },
    getEdgeDetail(input) {
      return reads.getEdgeDetail(input);
    },

    getProvenanceGraph(input) {
      return reads.getProvenanceGraph(input);
    },
    getProvenanceVectors(input) {
      return reads.getProvenanceVectors(input);
    },
    getSourceMapTextPreview(sourceMapId, maxChars) {
      return reads.getSourceMapTextPreview(sourceMapId, maxChars);
    },
    getSourceMapText(sourceMapId) {
      return reads.getSourceMapText(sourceMapId);
    },
    async listProvenanceEvents(input = {}) {
      const response = await service.postJson<DatabaseProvenanceEventsResponse>(
        MEMORIES_HTTP_PATH.databasesProvenanceEvents,
        {
          database,
          ...(input.namespace !== undefined ? { namespace: input.namespace } : {}),
          ...(input.key !== undefined ? { key: input.key } : {}),
          ...(input.edgeId !== undefined ? { edgeId: input.edgeId } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.before !== undefined ? { before: input.before } : {}),
        },
      );
      return response.events;
    },
    async listProvenanceChain(input = {}) {
      const response = await service.postJson<DatabaseProvenanceChainResponse>(
        MEMORIES_HTTP_PATH.databasesProvenanceChain,
        {
          database,
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.beforeRootHex !== undefined ? { beforeRootHex: input.beforeRootHex } : {}),
        },
      );
      return response.links;
    },
    async getMemoryContentAtRootHex(input) {
      const response = await service.postJson<DatabaseProvenanceContentResponse>(
        MEMORIES_HTTP_PATH.databasesProvenanceContent,
        {
          database,
          rootHex: input.rootHex,
          namespace: input.namespace,
          key: input.key,
        },
      );
      return response.content;
    },
    async getBackendCapabilities() {
      const response = await service.postJson<{
        capabilities: Record<string, boolean | undefined>;
      }>(MEMORIES_HTTP_PATH.databasesCapabilities, { database });
      return response.capabilities;
    },

    findMemoryIdByKey(namespace, key) {
      return reads.findMemoryIdByKey(namespace, key);
    },
    loadMemoryNamespaceKey(memoryId) {
      return reads.loadMemoryNamespaceKey(memoryId);
    },

    searchRecords(input) {
      const embeddingModel =
        input.embeddingModel ?? defaultEmbedding ?? resolveAgentEmbeddingModel();
      return runStandardHybridMemorySearch(client, {
        ...input,
        ...(embeddingModel !== undefined ? { embeddingModel } : {}),
      });
    },

    async searchGraph(input) {
      const query = input.query.trim();
      const scope = input.scope === "exact" ? "exact" : "subtree";
      if (query.length === 0) {
        return {
          hitCount: 0,
          hitKeys: [],
          neighborKeys: [],
          keys: [],
          hitSnippets: [],
          edgeHitSnippets: [],
        };
      }
      const topK = Math.min(50, Math.max(1, input.topK ?? 10));
      const maxNeighbors = Math.min(50, Math.max(0, input.maxNeighbors ?? 5));
      const hits = await model.searchRecords({
        namespace: input.namespace,
        query,
        topK,
        neighbors: "all",
        maxNeighbors,
        requireEmbedding: input.requireEmbedding ?? true,
        searchScopeMode: scope === "exact" ? "exactScope" : "pathSubtree",
        ...(input.embeddingModel !== undefined ? { embeddingModel: input.embeddingModel } : {}),
        ...(input.maxVectorDistance !== undefined
          ? { maxVectorDistance: input.maxVectorDistance }
          : {}),
      });

      const hitKeys = hits.map((hit) => qualifySearchKey(hit.namespace, hit.memory_key, scope));
      const neighborKeys: string[] = [];
      const edgeEndpointKeys: string[] = [];
      for (const hit of hits) {
        for (const neighbor of hit.neighbors ?? []) {
          neighborKeys.push(qualifySearchKey(hit.namespace, neighbor.memory_key, scope));
        }
        if (hit.kind === "edge" && hit.edge !== undefined) {
          edgeEndpointKeys.push(
            qualifySearchKey(hit.namespace, hit.edge.from_key, scope),
            qualifySearchKey(hit.namespace, hit.edge.to_key, scope),
          );
        }
      }
      const keys = [...new Set([...hitKeys, ...neighborKeys, ...edgeEndpointKeys])];
      const hitSnippets = await Promise.all(
        hits.map(async (hit) => {
          const sourceMapId = ids.sourceMap(
            ids.memory(hit.namespace, hit.memory_key),
            hit.source_key,
          );
          return {
            key: qualifySearchKey(hit.namespace, hit.memory_key, scope),
            sourceKey: hit.source_key,
            text: await reads.getSourceMapTextPreview(sourceMapId, SEARCH_HIT_SNIPPET_MAX),
          };
        }),
      );
      const edgeHitSnippets = (
        await Promise.all(
          hits.map(async (hit) => {
            if (hit.kind !== "edge" || hit.edge === undefined) return [];
            const sourceMapId = ids.sourceMap(
              ids.memory(hit.namespace, hit.memory_key),
              hit.source_key,
            );
            return [
              {
                edgeId: hit.memory_key,
                fromKey: qualifySearchKey(hit.namespace, hit.edge.from_key, scope),
                toKey: qualifySearchKey(hit.namespace, hit.edge.to_key, scope),
                text: await reads.getSourceMapTextPreview(sourceMapId, SEARCH_HIT_SNIPPET_MAX),
              },
            ];
          }),
        )
      ).flat();

      return {
        hitCount: hits.length,
        hitKeys,
        neighborKeys: [...new Set(neighborKeys)],
        keys,
        hitSnippets,
        edgeHitSnippets,
      };
    },

    searchNamespaces(input) {
      return runStandardNamespaceSearch(client, input);
    },

    resolveMemorySource(ref) {
      return store.resolve(ref);
    },
  };

  return model;
}
