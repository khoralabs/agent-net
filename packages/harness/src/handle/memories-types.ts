import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-node/ontology";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import type {
  MemoriesServiceClient,
  RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service/client";

import type { IntegrateMemoryEvent } from "../agent/memories/integrate/memory-event.ts";
import { resolveHarnessEmbeddingModel } from "../agent/memories/tools/_helpers/embedding-model.ts";
import {
  runStandardHybridMemorySearch,
  type StandardHybridMemorySearchInput,
} from "../agent/memories/tools/_helpers/memory-search.ts";
import { writeMemoryNode } from "../agent/memories/tools/_helpers/memory-write.ts";

/** A bound memories client scoped to a single agent's database. */
export type AgentMemoriesClient = {
  /** The `MemoriesDatabaseId` for this agent. Pass to `MemoriesServiceClient` for raw access. */
  readonly database: MemoriesDatabaseId;
  /** Ontology provided at spawn for this agent's memories DB. */
  readonly ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;
  open(): Promise<void>;
  close(): Promise<void>;
  checkpoint(): Promise<void>;
  exists(): Promise<boolean>;
  delete(): Promise<void>;
  /** The underlying service client, for operations not covered by the shortcuts above. */
  readonly serviceClient: MemoriesServiceClient;
  /** Typed runtime client for search, merge, and delete — lazy-init on first use. */
  readonly client: RemoteMemoriesClientAsync;
  /**
   * Hybrid memory search in this agent's DB (uses in-tree standard search helper).
   */
  search(
    input: Omit<StandardHybridMemorySearchInput, "embeddingModel"> & {
      embeddingModel?: EmbeddingModel;
    },
  ): Promise<Awaited<ReturnType<typeof runStandardHybridMemorySearch>>>;
  /**
   * Host-facing integrate shortcut: writes primary content via {@link writeMemoryNode}.
   * Full expand/extract agent loops remain host workflows.
   */
  integrate(
    event: IntegrateMemoryEvent,
    options?: { embeddingModel?: EmbeddingModel },
  ): Promise<{ key: string }>;
};

export function createBoundAgentMemoriesClient(input: {
  database: MemoriesDatabaseId;
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;
  serviceClient: MemoriesServiceClient;
  client: RemoteMemoriesClientAsync;
}): AgentMemoriesClient {
  const { database, ontology, serviceClient, client } = input;
  return {
    database,
    ontology,
    open: () => serviceClient.openDatabase(database),
    close: () => serviceClient.closeDatabase(database),
    checkpoint: () => serviceClient.checkpointDatabase(database),
    exists: () => serviceClient.databaseExists(database),
    delete: () => serviceClient.deleteDatabase(database),
    serviceClient,
    client,
    search(searchInput) {
      const embeddingModel = searchInput.embeddingModel ?? resolveHarnessEmbeddingModel();
      return runStandardHybridMemorySearch(client, {
        ...searchInput,
        ...(embeddingModel !== undefined ? { embeddingModel } : {}),
      });
    },
    async integrate(event, options) {
      const lexical = event.features.lexical.map((s) => s.trim()).filter((s) => s.length > 0);
      const text = lexical.join("\n\n") || event.instructions.trim();
      if (text.length === 0) {
        throw new Error("memories.integrate: features.lexical or instructions required");
      }
      const key =
        event.memoryKey?.trim() || event.correlationId.trim() || `integrate-${event.occurredAtMs}`;
      const embeddingModel = options?.embeddingModel ?? resolveHarnessEmbeddingModel();
      if (embeddingModel === undefined) {
        throw new Error(
          "memories.integrate: embeddingModel required (pass options.embeddingModel or set AI_GATEWAY_API_KEY)",
        );
      }
      await writeMemoryNode(
        client,
        { namespace: event.namespace, key, text },
        { embeddingModel, ontology },
      );
      return { key };
    },
  };
}
