import { describe, expect, test } from "bun:test";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import { createLazyHarnessMemoriesClient } from "./memories-client.ts";

const database = { kind: "account", ownerKey: "did:key:test" } as const;

function createMockClient() {
  let createCount = 0;
  const mockClient = {
    search: async () => [],
    mergeMemory: async () => ["memory-1"],
    deleteMemory: async () => undefined,
  } as unknown as RemoteMemoriesClientAsync;

  const createClient = async () => {
    createCount += 1;
    return mockClient;
  };

  const lazyClient = createLazyHarnessMemoriesClient(
    {
      baseUrl: "http://localhost:1234",
      database,
      ontology: { nodeLabels: {}, edgeLabels: {} },
      adminToken: "test-token",
    },
    createClient,
  );

  return { lazyClient, getCreateCount: () => createCount };
}

describe("createLazyHarnessMemoriesClient", () => {
  test("does not create the remote client until the first memory operation", async () => {
    const { lazyClient, getCreateCount } = createMockClient();

    expect(getCreateCount()).toBe(0);

    await lazyClient.mergeMemory({
      kind: "node",
      namespace: "notes",
      key: "observation-1",
      content: [{ key: "text", text: "hello" }],
      labels: [],
    });

    expect(getCreateCount()).toBe(1);
  });

  test("reuses the cached client on subsequent operations", async () => {
    const { lazyClient, getCreateCount } = createMockClient();

    await lazyClient.search({ namespace: "notes", content: { text: "hello" } });
    await lazyClient.deleteMemory({ namespace: "notes", key: "observation-1" });

    expect(getCreateCount()).toBe(1);
  });

  test("proxies persistence.listMemoryNamespaces through the lazy client", async () => {
    let createCount = 0;
    const mockClient = {
      search: async () => [],
      mergeMemory: async () => ["memory-1"],
      deleteMemory: async () => undefined,
      persistence: {
        listMemoryNamespaces: async () => ["notes", "skills"],
      },
    } as unknown as RemoteMemoriesClientAsync;

    const lazyClient = createLazyHarnessMemoriesClient(
      {
        baseUrl: "http://localhost:1234",
        database,
        ontology: { nodeLabels: {}, edgeLabels: {} },
        adminToken: "test-token",
      },
      async () => {
        createCount += 1;
        return mockClient;
      },
    );

    expect(createCount).toBe(0);
    const listFn = lazyClient.persistence.listMemoryNamespaces;
    expect(listFn).toBeDefined();
    const namespaces = await listFn?.call(lazyClient.persistence);
    expect(namespaces).toEqual(["notes", "skills"]);
    expect(createCount).toBe(1);
  });
});
