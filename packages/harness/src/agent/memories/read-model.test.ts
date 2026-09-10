import { describe, expect, test } from "bun:test";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import type {
  MemoriesServiceClient,
  RemoteMemoriesClientAsync,
  RemoteMemoriesReadClient,
} from "@khoralabs/memories-service/client";
import { createMemoriesReadModel, MemoriesReadModelError } from "./read-model.ts";

const database: MemoriesDatabaseId = { kind: "account", ownerKey: "did:key:test" };

describe("createMemoriesReadModel", () => {
  test("requires baseUrl and auth", () => {
    expect(() =>
      createMemoriesReadModel({
        baseUrl: "",
        database,
        adminToken: "tok",
      }),
    ).toThrow(MemoriesReadModelError);
    expect(() =>
      createMemoriesReadModel({
        baseUrl: "http://memories.test",
        database,
      }),
    ).toThrow(/adminToken or auth/);
  });

  test("forwards catalog/graph reads and omits mutation methods", async () => {
    const calls: string[] = [];
    const reads = {
      listNamespaces: async () => {
        calls.push("listNamespaces");
        return [{ namespace: "a", alias: null, description: "", suppressed: false }];
      },
      getGraphLayout: async () => {
        calls.push("getGraphLayout");
        return { namespace: "a", nodes: [], edges: [] };
      },
      getMemoryPreview: async () => {
        calls.push("getMemoryPreview");
        return {
          key: "k1",
          namespace: "a",
          labels: [],
          content: [],
          properties: { color: "blue" },
          suppressed: false,
        };
      },
    } as unknown as RemoteMemoriesReadClient;
    const client = {} as unknown as RemoteMemoriesClientAsync;
    const service = {} as unknown as MemoriesServiceClient;

    const model = createMemoriesReadModel({
      baseUrl: "http://memories.test",
      database,
      adminToken: "secret",
      reads,
      client,
      service,
    });

    expect(await model.listNamespaces()).toEqual([
      { namespace: "a", alias: null, description: "", suppressed: false },
    ]);
    expect(await model.getGraphLayout({ namespace: "a" })).toEqual({
      namespace: "a",
      nodes: [],
      edges: [],
    });
    const preview = await model.getMemoryPreview({ namespace: "a", key: "k1" });
    expect(preview.properties).toEqual({ color: "blue" });
    expect(calls).toEqual(["listNamespaces", "getGraphLayout", "getMemoryPreview"]);

    const runtime = model as unknown as Record<string, unknown>;
    expect(runtime.upsertNamespaceMetadata).toBeUndefined();
    expect(runtime.deleteNamespace).toBeUndefined();
    expect(runtime.renameNamespace).toBeUndefined();
    expect(runtime.adminToken).toBeUndefined();
    expect(runtime.mergeMemory).toBeUndefined();
  });

  test("searchGraph builds snippets and qualified keys", async () => {
    const hits = [
      {
        namespace: "root/child",
        memory_key: "n1",
        kind: "node" as const,
        score: 1,
        labels: [],
        source_key: "body",
        neighbors: [{ memory_key: "n2", labels: [] }],
      },
    ];
    const reads = {
      getSourceMapTextPreview: async () => "snippet text",
    } as unknown as RemoteMemoriesReadClient;

    const model = createMemoriesReadModel({
      baseUrl: "http://memories.test",
      database,
      adminToken: "secret",
      reads,
      client: {} as unknown as RemoteMemoriesClientAsync,
      service: {} as unknown as MemoriesServiceClient,
    });

    (model as { searchRecords: typeof model.searchRecords }).searchRecords = async () => hits;

    const page = await model.searchGraph({
      namespace: "root",
      query: "hello",
      scope: "subtree",
      requireEmbedding: false,
    });
    expect(page.hitCount).toBe(1);
    expect(page.hitKeys).toEqual(["root/child::n1"]);
    expect(page.neighborKeys).toEqual(["root/child::n2"]);
    expect(page.hitSnippets[0]?.text).toBe("snippet text");
  });

  test("searchGraph returns empty page for blank query", async () => {
    const model = createMemoriesReadModel({
      baseUrl: "http://memories.test",
      database,
      adminToken: "secret",
      reads: {} as unknown as RemoteMemoriesReadClient,
      client: {} as unknown as RemoteMemoriesClientAsync,
      service: {} as unknown as MemoriesServiceClient,
    });
    expect(await model.searchGraph({ namespace: "a", query: "  " })).toEqual({
      hitCount: 0,
      hitKeys: [],
      neighborKeys: [],
      keys: [],
      hitSnippets: [],
      edgeHitSnippets: [],
    });
  });

  test("listProvenanceEvents posts through service client", async () => {
    let seenPath = "";
    let seenBody: unknown;
    const service = {
      postJson: async (path: string, body: unknown) => {
        seenPath = path;
        seenBody = body;
        return { events: [{ id: "e1" }] };
      },
    } as unknown as MemoriesServiceClient;
    const model = createMemoriesReadModel({
      baseUrl: "http://memories.test",
      database,
      adminToken: "secret",
      reads: {} as unknown as RemoteMemoriesReadClient,
      client: {} as unknown as RemoteMemoriesClientAsync,
      service,
    });
    const events = await model.listProvenanceEvents({ limit: 5 });
    expect(events).toEqual([{ id: "e1" }] as unknown as typeof events);
    expect(seenPath).toBe("/databases/provenance/events");
    expect(seenBody).toEqual({ database, limit: 5 });
  });
});
