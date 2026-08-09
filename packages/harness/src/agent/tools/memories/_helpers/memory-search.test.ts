import { describe, expect, test } from "bun:test";
import type { SearchOutput, SearchParams } from "@khoralabs/memories-node";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import {
  EMBEDDING_MODEL_REQUIRED_MESSAGE,
  resolveMemoriesSearchAsOf,
  runStandardHybridMemorySearch,
} from "./memory-search.ts";
import { createTestEmbeddingModel } from "./test-embedding.ts";

function mockClient(): RemoteMemoriesClientAsync {
  return {
    search: async (_params: SearchParams): Promise<SearchOutput> => ({
      hits: [],
    }),
    persistence: {},
  } as unknown as RemoteMemoriesClientAsync;
}

describe("runStandardHybridMemorySearch", () => {
  test("requireEmbedding throws when embeddingModel is missing", async () => {
    await expect(
      runStandardHybridMemorySearch(mockClient(), {
        namespace: "notes",
        query: "company products",
        requireEmbedding: true,
      }),
    ).rejects.toThrow(EMBEDDING_MODEL_REQUIRED_MESSAGE);
  });

  test("requireEmbedding succeeds when embeddingModel is set", async () => {
    const hits = await runStandardHybridMemorySearch(mockClient(), {
      namespace: "notes",
      query: "company products",
      embeddingModel: createTestEmbeddingModel(),
      requireEmbedding: true,
    });
    expect(hits).toEqual([]);
  });

  test("without requireEmbedding, missing model soft-falls to lexical (no throw)", async () => {
    const hits = await runStandardHybridMemorySearch(mockClient(), {
      namespace: "notes",
      query: "company products",
    });
    expect(hits).toEqual([]);
  });

  test("resolveMemoriesSearchAsOf returns { lte } from provenance timestamp", async () => {
    const client = {
      search: async (): Promise<SearchOutput> => ({ hits: [] }),
      persistence: {
        getProvenanceHeadRootHex: async () => "deadbeef",
        getProvenanceTimestampMsForRootHex: async (rootHex: string) =>
          rootHex === "deadbeef" ? 1_700_000_000_000 : undefined,
      },
    } as unknown as RemoteMemoriesClientAsync;

    await expect(resolveMemoriesSearchAsOf(client)).resolves.toEqual({ lte: 1_700_000_000_000 });
  });

  test("passes provenance as-of cutoff into hybrid search params", async () => {
    const captured: SearchParams[] = [];
    const client = {
      search: async (params: SearchParams): Promise<SearchOutput> => {
        captured.push(params);
        return { hits: [] };
      },
      persistence: {
        getProvenanceHeadRootHex: async () => "deadbeef",
        getProvenanceTimestampMsForRootHex: async (rootHex: string) =>
          rootHex === "deadbeef" ? 1_700_000_000_000 : undefined,
      },
    } as unknown as RemoteMemoriesClientAsync;

    await runStandardHybridMemorySearch(client, {
      namespace: "notes",
      query: "company products",
    });

    expect(captured.length).toBeGreaterThan(0);
    expect(captured.some((p) => p.asOf?.lte === 1_700_000_000_000)).toBe(true);
  });
});
