import { describe, expect, test } from "bun:test";
import { ids } from "@khoralabs/memories-node";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import type { UIMessage } from "ai";
import {
  createRemoteSourceMapContentStore,
  DEFAULT_MEMORY_SOURCE_KEY,
} from "../services/memories/tools/_helpers/source-map-content-store.ts";
import {
  AGENT_MEMORY_DOMAIN,
  agentMemorySourceRef,
  createAgentMemoryStore,
  isAgentMemorySourceRef,
  sourcesFromMemoryToolParts,
} from "./agent-memory-source.ts";

function toolPart(
  name: string,
  input: unknown,
  output: unknown,
  state = "output-available",
): UIMessage["parts"][number] {
  return {
    type: `tool-${name}`,
    toolCallId: `${name}-1`,
    state,
    input,
    output,
  } as UIMessage["parts"][number];
}

describe("agent-memory-source", () => {
  test("isAgentMemorySourceRef accepts locator shape", () => {
    const ref = agentMemorySourceRef({
      namespace: "agent/did/notes",
      memoryKey: "alpha",
    });
    expect(ref.domain).toBe(AGENT_MEMORY_DOMAIN);
    expect(isAgentMemorySourceRef(ref)).toBe(true);
    expect(isAgentMemorySourceRef({ domain: "other" })).toBe(false);
  });

  test("sourcesFromMemoryToolParts collects search / write / replace / resolve", () => {
    const parts = [
      toolPart(
        "searchMemories",
        { namespace: "agent/did", query: "hello" },
        {
          hits: [
            {
              namespace: "agent/did",
              memory_key: "a",
              kind: "node",
              source_key: "text:0",
              score: 1,
              labels: [],
            },
            {
              namespace: "agent/did",
              memory_key: "edge-1",
              kind: "edge",
              source_key: "text:0",
              score: 0.5,
              labels: [],
            },
          ],
        },
      ),
      toolPart(
        "writeMemory",
        { namespace: "agent/did", key: "b", text: "note" },
        { memoryIds: ["mem-b"] },
      ),
      toolPart(
        "replaceMemoryLines",
        { namespace: "agent/did", key: "c", changes: [] },
        {
          namespace: "agent/did",
          key: "c",
          memoryIds: ["mem-c"],
          lines: [],
        },
      ),
      toolPart(
        "resolveMemories",
        { memories: [{ namespace: "agent/did", key: "a" }] },
        {
          results: [{ namespace: "agent/did", key: "a", text: "x" }],
        },
      ),
      toolPart("searchNamespaces", { query: "x" }, { namespaces: [] }),
      toolPart(
        "searchMemories",
        { namespace: "agent/did", query: "pending" },
        { hits: [] },
        "input-available",
      ),
    ] as UIMessage["parts"];

    const sources = sourcesFromMemoryToolParts(parts);
    const sourceIds = sources.map((s) => s.id).sort();
    expect(sourceIds).toContain("mem-b");
    expect(sourceIds).toContain("mem-c");
    expect(sources.every((s) => isAgentMemorySourceRef(s.sourceRef))).toBe(true);
    expect(
      sources.some(
        (s) =>
          isAgentMemorySourceRef(s.sourceRef) &&
          s.sourceRef.memory_key === "a" &&
          s.sourceRef.source_key === "text:0",
      ),
    ).toBe(true);
    expect(
      sources.some(
        (s) => isAgentMemorySourceRef(s.sourceRef) && s.sourceRef.memory_key === "edge-1",
      ),
    ).toBe(false);
  });

  test("sourcesFromMemoryToolParts dedupes by memory_id", () => {
    const parts = [
      toolPart(
        "searchMemories",
        { namespace: "ns", query: "q" },
        {
          hits: [
            {
              namespace: "ns",
              memory_key: "k",
              kind: "node",
              source_key: "text:0",
              score: 1,
              labels: [],
            },
          ],
        },
      ),
      toolPart(
        "resolveMemories",
        { memories: [{ namespace: "ns", key: "k" }] },
        { results: [{ namespace: "ns", key: "k", text: "" }] },
      ),
    ] as UIMessage["parts"];
    expect(sourcesFromMemoryToolParts(parts)).toHaveLength(1);
  });

  test("sourcesFromMemoryToolParts collects skill search / write / replace / resolve", () => {
    const parts = [
      toolPart(
        "searchSkills",
        { query: "summarize" },
        {
          namespace: "_skills_",
          hits: [
            {
              namespace: "_skills_",
              memory_key: "summarize-thread",
              kind: "node",
              source_key: "text:0",
              score: 1,
              labels: [],
            },
          ],
        },
      ),
      toolPart(
        "writeSkill",
        { name: "Draft", description: "d", body: "b" },
        {
          memoryIds: ["mem-skill"],
          key: "draft",
          name: "Draft",
          namespace: "_skills_",
        },
      ),
      toolPart(
        "resolveSkills",
        { keys: ["draft"] },
        {
          results: [{ key: "draft", namespace: "_skills_", text: "---" }],
        },
      ),
    ] as UIMessage["parts"];

    const sources = sourcesFromMemoryToolParts(parts);
    expect(sources.some((s) => s.id === "mem-skill")).toBe(true);
    expect(
      sources.some(
        (s) =>
          isAgentMemorySourceRef(s.sourceRef) &&
          s.sourceRef.namespace === "_skills_" &&
          s.sourceRef.memory_key === "summarize-thread",
      ),
    ).toBe(true);
  });
});

describe("createRemoteSourceMapContentStore / createAgentMemoryStore", () => {
  const namespace = "notes";
  const memoryKey = "events/platform:product:abc/order-100-units";
  const body = "Ordered one hundred units for the launch.";
  const memoryId = ids.memory(namespace, memoryKey);

  function mockClient(opts?: {
    textBySourceMapId?: Map<string, string>;
    missingBody?: boolean;
  }): RemoteMemoriesClientAsync {
    const textBySourceMapId =
      opts?.textBySourceMapId ??
      new Map([[ids.sourceMap(memoryId, DEFAULT_MEMORY_SOURCE_KEY), body]]);
    return {
      persistence: {
        findMemoryIdByKey: async (ns: string, key: string) =>
          ns === namespace && key === memoryKey ? memoryId : undefined,
        loadMemoryNamespaceKey: async (id: string) =>
          id === memoryId ? { namespace, key: memoryKey } : undefined,
        getSourceMapTextPreview: async (sourceMapId: string) => {
          if (opts?.missingBody) return null;
          return textBySourceMapId.get(sourceMapId) ?? null;
        },
      },
    } as unknown as RemoteMemoriesClientAsync;
  }

  test("content store resolves text without searching by key string", async () => {
    const client = mockClient();
    const store = createRemoteSourceMapContentStore(client);
    const resolved = await store.resolve({
      memory_id: memoryId,
      source_key: DEFAULT_MEMORY_SOURCE_KEY,
    });
    expect(resolved).toEqual({ kind: "string", string: body });
  });

  test("AgentMemoryStore.resolve succeeds when body does not contain the key", async () => {
    expect(body.includes(memoryKey)).toBe(false);
    const store = createAgentMemoryStore(mockClient());
    const ref = agentMemorySourceRef({
      namespace,
      memoryKey,
      memoryId,
    });
    const resolved = await store.resolve(ref);
    expect(resolved.kind).toBe("record");
    if (resolved.kind !== "record") return;
    expect(resolved.domain).toBe(AGENT_MEMORY_DOMAIN);
    expect(resolved.value.namespace).toBe(namespace);
    expect(resolved.value.memory_key).toBe(memoryKey);
    expect(resolved.value.memory_id).toBe(memoryId);
    expect(resolved.value.text).toBe(body);
  });

  test("AgentMemoryStore.resolve prefers store locators from memory_id", async () => {
    const store = createAgentMemoryStore(mockClient());
    const resolved = await store.resolve({
      domain: AGENT_MEMORY_DOMAIN,
      namespace: "stale/namespace",
      memory_key: "stale-key",
      memory_id: memoryId,
    });
    expect(resolved.kind).toBe("record");
    if (resolved.kind !== "record") return;
    expect(resolved.value.namespace).toBe(namespace);
    expect(resolved.value.memory_key).toBe(memoryKey);
  });

  test("AgentMemoryStore.resolve returns locators when content is missing", async () => {
    const store = createAgentMemoryStore(mockClient({ missingBody: true }));
    const resolved = await store.resolve(agentMemorySourceRef({ namespace, memoryKey, memoryId }));
    expect(resolved.kind).toBe("record");
    if (resolved.kind !== "record") return;
    expect(resolved.value.memory_id).toBe(memoryId);
    expect(resolved.value.text).toBe("");
  });
});
