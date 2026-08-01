import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@khoralabs/agent-capabilities";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import {
  ids,
  type SearchHit,
  type SearchOutput,
  type SearchParams,
} from "@khoralabs/memories-node";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import { harnessToolkit } from "../_toolkit.ts";
import { emptyDisabledToolSets, type HarnessToolkitEnv } from "../types.ts";
import { createEphemeralRecentNamespacesTracker } from "./_helpers/recent-namespaces.ts";
import {
  createTestEmbeddingModel,
  installTestMemoriesOntology,
  resetTestMemoriesOntology,
} from "./_helpers/test-embedding.ts";

type MemoryToolName = "resolveMemories" | "replaceMemoryLines";

type StoredMemory = {
  namespace: string;
  key: string;
  text: string;
};

function memoryIdFor(item: StoredMemory): string {
  return `memory:${item.namespace}/${item.key}`;
}

type MockMemoriesClient = {
  mergeMemory: (params: {
    namespace: string;
    key: string;
    content: Array<{ key: string; text?: string; vector?: number[] }>;
  }) => Promise<string[]>;
  search: (params: SearchParams) => Promise<SearchOutput>;
  persistence: {
    findMemoryIdByKey: (namespace: string, key: string) => Promise<string | undefined>;
    getSourceMapTextPreview: (sourceMapId: string, maxChars?: number) => Promise<string | null>;
  };
};

function createEnv(overrides: Partial<HarnessToolkitEnv> = {}): HarnessToolkitEnv {
  return {
    skills: [],
    activatedSkillNames: new Set(),
    embeddingCache: new Map(),
    embeddingModel: createTestEmbeddingModel(),
    recentNamespaces: createEphemeralRecentNamespacesTracker(),
    ...emptyDisabledToolSets(),
    ...overrides,
  };
}

function createMockClient(stored: StoredMemory[]): MockMemoriesClient {
  return {
    mergeMemory: async (params) => {
      const text = params.content
        .map((item) => (typeof item.text === "string" ? item.text : ""))
        .filter((t) => t.length > 0)
        .join("\n\n");
      const existingIndex = stored.findIndex(
        (item) => item.namespace === params.namespace && item.key === params.key,
      );
      const record = { namespace: params.namespace, key: params.key, text };
      if (existingIndex >= 0) {
        stored[existingIndex] = record;
      } else {
        stored.push(record);
      }
      return [params.key];
    },
    search: async (params) => ({
      hits: stored
        .filter(
          (item) =>
            item.namespace.startsWith(params.namespace) &&
            (item.key.includes("text" in params.content ? params.content.text : "") ||
              item.text.includes("text" in params.content ? params.content.text : "")),
        )
        .map(
          (item, index) =>
            ({
              _id: `source-${item.namespace}::${item.key}`,
              score: 1,
              source_key: "text:0",
              memory: {
                id: `memory-${index}`,
                namespace: item.namespace,
                key: item.key,
                kind: "node",
                _ts_created: Date.now(),
              },
              labels: [],
              graph: { kind: "node", nodeId: `node-${index}` },
            }) as unknown as SearchHit,
        ),
    }),
    persistence: {
      findMemoryIdByKey: async (namespace, key) => {
        const item = stored.find((row) => row.namespace === namespace && row.key === key);
        return item !== undefined ? memoryIdFor(item) : undefined;
      },
      getSourceMapTextPreview: async (sourceMapId) => {
        for (const item of stored) {
          if (ids.sourceMap(memoryIdFor(item), "text:0") === sourceMapId) {
            return item.text;
          }
        }
        return null;
      },
    },
  };
}

describe("memory resolve / replace tools", () => {
  let stored: StoredMemory[];
  let env: HarnessToolkitEnv;

  beforeEach(() => {
    installTestMemoriesOntology();
    stored = [
      {
        namespace: "notes",
        key: "plan",
        text: "Line one.\nLine two.\nLine three.",
      },
      {
        namespace: "notes",
        key: "other",
        text: "Only one line.",
      },
    ];
    env = createEnv({
      memoriesClient: createMockClient(stored) as unknown as RemoteMemoriesClientAsync,
    });
  });

  afterEach(() => {
    resetTestMemoriesOntology();
  });

  async function toolHandler(name: MemoryToolName) {
    const { tools } = await evaluateComposable(harnessToolkit, { env });
    const spec = (tools as Partial<Record<MemoryToolName, ToolSpec>>)[name];
    if (spec === undefined) throw new Error(`tool not available: ${name}`);
    return spec.handler.bind(spec) as (
      ctx: ToolRuntimeContext<HarnessToolkitEnv>,
      input: unknown,
    ) => Promise<unknown>;
  }

  test("resolve / replace tools are hidden when memories client is not configured", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv(),
    });
    const typed = tools as Partial<Record<MemoryToolName, ToolSpec>>;
    expect(typed.resolveMemories).toBeUndefined();
    expect(typed.replaceMemoryLines).toBeUndefined();
  });

  test("resolveMemories returns text by default", async () => {
    const resolveMemories = await toolHandler("resolveMemories");
    const result = (await resolveMemories(
      { env, agentId: "agent", agentName: "Agent" },
      { memories: [{ namespace: "notes", key: "plan" }] },
    )) as { results: Array<{ namespace: string; key: string; text?: string }> };

    expect(result.results).toEqual([
      {
        namespace: "notes",
        key: "plan",
        text: "Line one.\nLine two.\nLine three.",
      },
    ]);
  });

  test("resolveMemories enumerates lines when requested", async () => {
    const resolveMemories = await toolHandler("resolveMemories");
    const result = (await resolveMemories(
      { env, agentId: "agent", agentName: "Agent" },
      {
        memories: [{ namespace: "notes", key: "plan" }],
        enumerateLines: true,
      },
    )) as { results: Array<{ lines?: Array<[number, string]> }> };

    expect(result.results[0]?.lines).toEqual([
      [1, "Line one."],
      [2, "Line two."],
      [3, "Line three."],
    ]);
  });

  test("resolveMemories batches and reports per-item errors", async () => {
    const resolveMemories = await toolHandler("resolveMemories");
    const result = (await resolveMemories(
      { env, agentId: "agent", agentName: "Agent" },
      {
        memories: [
          { namespace: "notes", key: "other" },
          { namespace: "notes", key: "missing" },
        ],
      },
    )) as {
      results: Array<{ namespace: string; key: string; text?: string; error?: string }>;
    };

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      namespace: "notes",
      key: "other",
      text: "Only one line.",
    });
    expect(result.results[1]?.error).toMatch(/memory not found/);
  });

  test("replaceMemoryLines updates specific lines and persists merged text", async () => {
    const replaceMemoryLines = await toolHandler("replaceMemoryLines");
    const result = (await replaceMemoryLines(
      { env, agentId: "agent", agentName: "Agent" },
      {
        namespace: "notes",
        key: "plan",
        changes: [{ lineNumber: 2, content: "Updated line two." }],
      },
    )) as {
      namespace: string;
      key: string;
      memoryIds: string[];
      lines: Array<[number, string]>;
    };

    expect(result.memoryIds).toEqual([memoryIdFor({ namespace: "notes", key: "plan", text: "" })]);
    expect(result.lines[1]).toEqual([2, "Updated line two."]);
    expect(stored[0]?.text).toBe("Line one.\nUpdated line two.\nLine three.");
  });

  test("replaceMemoryLines rejects invalid line numbers", async () => {
    const replaceMemoryLines = await toolHandler("replaceMemoryLines");
    await expect(
      replaceMemoryLines(
        { env, agentId: "agent", agentName: "Agent" },
        { namespace: "notes", key: "plan", changes: [{ lineNumber: 99, content: "nope" }] },
      ),
    ).rejects.toThrow(/out of range/);
  });
});
