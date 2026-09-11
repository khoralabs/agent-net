import { describe, expect, test } from "bun:test";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import { MEMORIES_HTTP_PATH } from "@khoralabs/memories-service/http/contracts";
import { createMemoriesReadModel } from "./read-model.ts";
import { createTestEmbeddingModel } from "./tools/_helpers/test-embedding.ts";

const database: MemoriesDatabaseId = { kind: "account", ownerKey: "did:key:contract" };
const baseUrl = "http://memories.contract.test";
const adminToken = "contract-admin-token";

type Json = Record<string, unknown>;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/**
 * Minimal Memories HTTP fixture: real service/read clients over a path-routed fetch.
 * Covers representative Bloom-needed read groups without a live service.
 */
function createMemoriesHttpFixture(): {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  seen: Array<{ path: string; auth: string | null; body: Json | null }>;
} {
  const seen: Array<{ path: string; auth: string | null; body: Json | null }> = [];

  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const path = u.pathname;
    const auth = new Headers(init?.headers).get("Authorization");
    let body: Json | null = null;
    if (typeof init?.body === "string" && init.body.length > 0) {
      body = JSON.parse(init.body) as Json;
    }
    seen.push({ path, auth, body });

    switch (path) {
      case MEMORIES_HTTP_PATH.databasesCapabilities:
        return json({
          capabilities: { hybridSearch: true, provenance: true },
          namespaceLimits: { maxDepth: 8, maxLength: 256 },
        });
      case MEMORIES_HTTP_PATH.databasesNamespaces:
        return json({
          namespaces: [
            {
              namespace: "notes",
              alias: "Notes",
              description: "demo",
              suppressed: false,
            },
          ],
        });
      case MEMORIES_HTTP_PATH.databasesNamespacesGet:
        return json({
          namespace: {
            namespace: "notes",
            alias: "Notes",
            description: "demo",
            suppressed: false,
          },
        });
      case MEMORIES_HTTP_PATH.databasesGraphLayout:
        return json({
          layout: {
            namespace: "notes",
            nodes: [
              {
                key: "m1",
                x: 0,
                y: 0,
                z: 0,
                labels: [],
                degree: { count: 0, centrality: 0 },
              },
            ],
            edges: [],
          },
        });
      case MEMORIES_HTTP_PATH.databasesMemoryPreview:
        return json({
          key: "m1",
          namespace: "notes",
          labels: [],
          content: [
            {
              sourceKey: "body",
              sourceMapId: "sm-body",
              text: "hello memory",
              hasText: true,
              hasVector: false,
              createdAt: 1,
            },
          ],
          properties: { color: "teal", freeform: true },
          suppressed: false,
        });
      case MEMORIES_HTTP_PATH.databasesFindMemoryId:
        return json({ memoryId: "mem-id-1" });
      case MEMORIES_HTTP_PATH.databasesLoadMemoryNamespaceKey:
        return json({
          record: { namespace: "notes", key: "m1", suppressed: false },
        });
      case MEMORIES_HTTP_PATH.databasesSourceMapTextPreview:
        return json({ text: "snippet from source map" });
      case MEMORIES_HTTP_PATH.databasesProvenanceEvents:
        return json({
          events: [
            {
              id: "evt-1",
              rootHex: "aa",
              parentRootHex: null,
              eventType: "merge",
              createdAt: 10,
              event: {},
            },
          ],
        });
      case MEMORIES_HTTP_PATH.databasesProvenanceContent:
        return json({
          content: [{ sourceKey: "body", text: "historical", hasText: true }],
        });
      case MEMORIES_HTTP_PATH.databasesProvenanceHead:
        return json({ rootHex: "deadbeef" });
      case MEMORIES_HTTP_PATH.databasesProvenanceTimestamp:
        return json({ timestampMs: 1_700_000_000_000 });
      case MEMORIES_HTTP_PATH.databasesSearch:
        return json({
          hits: [
            {
              id: "hit-1",
              memoryId: "mem-id-1",
              sourceKey: "body",
              score: 1,
              memory: {
                namespace: "notes",
                key: "m1",
                labels: [],
              },
              labels: [],
              graph: { kind: "node" },
              neighbors: [],
            },
          ],
        });
      case MEMORIES_HTTP_PATH.databasesSearchNamespaces:
        return json({
          namespaces: [
            {
              namespace: "notes",
              score: 1,
              alias: "Notes",
              description: "demo",
              labels: [],
            },
          ],
        });
      default:
        return json({ error: `unhandled ${path}` }, 404);
    }
  };

  return { fetch: fetchImpl, seen };
}

describe("MemoriesReadModel HTTP contract", () => {
  test("covers catalog, graph, preview properties, lookup, provenance, and search", async () => {
    const fixture = createMemoriesHttpFixture();
    const model = createMemoriesReadModel({
      baseUrl,
      database,
      adminToken,
      fetch: fixture.fetch,
      embeddingModel: createTestEmbeddingModel(),
    });

    const namespaces = await model.listNamespaces();
    expect(namespaces[0]?.namespace).toBe("notes");

    const meta = await model.getNamespaceMetadata("notes");
    expect(meta?.alias).toBe("Notes");

    const layout = await model.getGraphLayout({ namespace: "notes" });
    expect(layout.nodes.length).toBe(1);

    const preview = await model.getMemoryPreview({ namespace: "notes", key: "m1" });
    expect(preview.properties).toEqual({ color: "teal", freeform: true });

    expect(await model.findMemoryIdByKey("notes", "m1")).toBe("mem-id-1");
    expect(await model.loadMemoryNamespaceKey("mem-id-1")).toMatchObject({
      namespace: "notes",
      key: "m1",
    });
    expect(await model.getSourceMapTextPreview("sm-body")).toBe("snippet from source map");

    const events = await model.listProvenanceEvents({ limit: 3 });
    expect(events[0]?.id).toBe("evt-1");

    const content = await model.getMemoryContentAtRootHex({
      rootHex: "aa",
      namespace: "notes",
      key: "m1",
    });
    expect(content[0]?.text).toBe("historical");

    const caps = await model.getBackendCapabilities();
    expect(caps.hybridSearch).toBe(true);

    const graphPage = await model.searchGraph({
      namespace: "notes",
      query: "hello",
      requireEmbedding: false,
      scope: "exact",
    });
    expect(graphPage.hitCount).toBe(1);
    expect(graphPage.hitKeys).toEqual(["m1"]);
    expect(graphPage.hitSnippets[0]?.text).toBe("snippet from source map");

    const nsSearch = await model.searchNamespaces({
      query: "notes",
      under: "notes",
    });
    expect(nsSearch.namespaces.length).toBeGreaterThan(0);

    for (const call of fixture.seen) {
      expect(call.auth).toBe(`Bearer ${adminToken}`);
    }
    const paths = new Set(fixture.seen.map((c) => c.path));
    expect(paths.has(MEMORIES_HTTP_PATH.databasesNamespaces)).toBe(true);
    expect(paths.has(MEMORIES_HTTP_PATH.databasesMemoryPreview)).toBe(true);
    expect(paths.has(MEMORIES_HTTP_PATH.databasesSearch)).toBe(true);
    expect(paths.has(MEMORIES_HTTP_PATH.databasesProvenanceEvents)).toBe(true);
  });
});
