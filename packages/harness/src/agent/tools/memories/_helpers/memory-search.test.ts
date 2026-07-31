import { describe, expect, test } from "bun:test";
import type { SearchOutput, SearchParams } from "@khoralabs/memories-node";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import {
  EMBEDDING_MODEL_REQUIRED_MESSAGE,
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
        namespace: "_root_",
        query: "company products",
        requireEmbedding: true,
      }),
    ).rejects.toThrow(EMBEDDING_MODEL_REQUIRED_MESSAGE);
  });

  test("requireEmbedding succeeds when embeddingModel is set", async () => {
    const hits = await runStandardHybridMemorySearch(mockClient(), {
      namespace: "_root_",
      query: "company products",
      embeddingModel: createTestEmbeddingModel(),
      requireEmbedding: true,
    });
    expect(hits).toEqual([]);
  });

  test("without requireEmbedding, missing model soft-falls to lexical (no throw)", async () => {
    const hits = await runStandardHybridMemorySearch(mockClient(), {
      namespace: "_root_",
      query: "company products",
    });
    expect(hits).toEqual([]);
  });
});
