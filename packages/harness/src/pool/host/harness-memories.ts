import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import type { MemoriesServiceFetch } from "@khoralabs/memories-service/client";
import {
  type AgentMemoriesOntology,
  agentMemoriesDatabase,
} from "@khoralabs/memories-service/client/agent";
import {
  createMemoriesReadModel,
  type MemoriesReadModel,
} from "../../agent/memories/read-model.ts";

export type HarnessMemoriesReadOptions = {
  embeddingModel?: EmbeddingModel;
  ontology?: AgentMemoriesOntology;
};

export type HarnessMemoriesAccess = {
  /**
   * Trusted-host / admin path: any `MemoriesDatabaseId` (e.g. workflow-owned account DBs).
   * Captures harness admin credentials; returned model does not expose them.
   */
  forDatabase(
    database: MemoriesDatabaseId,
    options?: HarnessMemoriesReadOptions,
  ): MemoriesReadModel;
  /**
   * Pool-scoped agent DB via {@link agentMemoriesDatabase}.
   * Rejects DIDs that are not members of the managed pool.
   */
  forAgent(did: string, options?: HarnessMemoriesReadOptions): MemoriesReadModel;
};

export type CreateHarnessMemoriesAccessInput = {
  memoriesBaseUrl: string;
  memoriesAdminToken: string;
  isManagedAgent: (did: string) => boolean;
  fetch?: MemoriesServiceFetch;
};

export function createHarnessMemoriesAccess(
  input: CreateHarnessMemoriesAccessInput,
): HarnessMemoriesAccess {
  const baseUrl = input.memoriesBaseUrl.trim().replace(/\/$/, "");
  const adminToken = input.memoriesAdminToken;
  const fetch = input.fetch;

  const forDatabase = (
    database: MemoriesDatabaseId,
    options?: HarnessMemoriesReadOptions,
  ): MemoriesReadModel =>
    createMemoriesReadModel({
      baseUrl,
      database,
      adminToken,
      ...(fetch !== undefined ? { fetch } : {}),
      ...(options?.embeddingModel !== undefined ? { embeddingModel: options.embeddingModel } : {}),
      ...(options?.ontology !== undefined ? { ontology: options.ontology } : {}),
    });

  return {
    forDatabase,
    forAgent(did, options) {
      const trimmed = did.trim();
      if (trimmed.length === 0) {
        throw new Error("harness.memories.forAgent: did is required");
      }
      if (!input.isManagedAgent(trimmed)) {
        throw new Error(`harness.memories.forAgent: agent ${trimmed} is not in the managed pool`);
      }
      return forDatabase(agentMemoriesDatabase(trimmed), options);
    },
  };
}
