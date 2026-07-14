import { beforeEach, describe, expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@khoralabs/agent-capabilities";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { SearchHit, SearchParams } from "@khoralabs/memories-core";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

import { harnessToolkit } from "../_toolkit.ts";
import type { HarnessToolkitEnv } from "../types.ts";

type MemoryLineToolName = "readMemoryLines" | "replaceMemoryLines";

type StoredMemory = {
  namespace: string;
  key: string;
  text: string;
};

type MockMemoriesClient = {
  mergeMemory: (params: {
    namespace: string;
    key: string;
    content: Array<{ key: string; text: string }>;
  }) => Promise<string[]>;
  search: (params: SearchParams) => Promise<SearchHit[]>;
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
    ...overrides,
  };
}

function createMockClient(stored: StoredMemory[]): MockMemoriesClient {
  return {
    mergeMemory: async (params) => {
      const text = params.content.find((item) => item.key === "text")?.text ?? "";
      const existingIndex = stored.findIndex(
        (item) => item.namespace === params.namespace && item.key === params.key,
      );
      const record = { namespace: params.namespace, key: params.key, text };
      if (existingIndex >= 0) {
        stored[existingIndex] = record;
      } else {
        stored.push(record);
      }
      return ["memory-1"];
    },
    search: async (params) =>
      stored
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
              source_key: "text",
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
    persistence: {
      findMemoryIdByKey: async (namespace, key) =>
        stored.some((item) => item.namespace === namespace && item.key === key)
          ? "memory-1"
          : undefined,
      getSourceMapTextPreview: async (sourceMapId) => {
        const payload = sourceMapId.replace(/^source-/, "");
        const separator = payload.indexOf("::");
        if (separator === -1) return null;
        const namespace = payload.slice(0, separator);
        const key = payload.slice(separator + 2);
        return (
          stored.find((item) => item.namespace === namespace && item.key === key)?.text ?? null
        );
      },
    },
  };
}

describe("memory line tools", () => {
  let stored: StoredMemory[];
  let env: HarnessToolkitEnv;

  beforeEach(() => {
    stored = [
      {
        namespace: "notes",
        key: "plan",
        text: "Line one.\nLine two.\nLine three.",
      },
    ];
    env = createEnv({
      memoriesClient: createMockClient(stored) as unknown as RemoteMemoriesClientAsync,
    });
  });

  async function toolHandler(name: MemoryLineToolName) {
    const { tools } = await evaluateComposable(harnessToolkit, { env });
    const spec = (tools as Partial<Record<MemoryLineToolName, ToolSpec>>)[name];
    if (spec === undefined) throw new Error(`tool not available: ${name}`);
    return spec.handler.bind(spec) as (
      ctx: ToolRuntimeContext<HarnessToolkitEnv>,
      input: unknown,
    ) => Promise<unknown>;
  }

  test("memory line tools are hidden when memories client is not configured", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv(),
    });
    const typed = tools as Partial<Record<MemoryLineToolName, ToolSpec>>;
    expect(typed.readMemoryLines).toBeUndefined();
    expect(typed.replaceMemoryLines).toBeUndefined();
  });

  test("readMemoryLines returns numbered tuples for any namespace", async () => {
    const readMemoryLines = await toolHandler("readMemoryLines");
    const result = (await readMemoryLines(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "notes", key: "plan" },
    )) as { namespace: string; key: string; lines: Array<[number, string]> };

    expect(result.namespace).toBe("notes");
    expect(result.key).toBe("plan");
    expect(result.lines).toEqual([
      [1, "Line one."],
      [2, "Line two."],
      [3, "Line three."],
    ]);
  });

  test("replaceMemoryLines updates specific lines and persists merged text", async () => {
    const replaceMemoryLines = await toolHandler("replaceMemoryLines");
    const result = (await replaceMemoryLines(
      { env, agentId: "agent", agentName: "Agent" },
      {
        namespace: "notes",
        key: "plan",
        changes: [[2, "Updated line two."]],
      },
    )) as {
      namespace: string;
      key: string;
      memoryIds: string[];
      lines: Array<[number, string]>;
    };

    expect(result.memoryIds).toEqual(["memory-1"]);
    expect(result.lines[1]).toEqual([2, "Updated line two."]);
    expect(stored[0]?.text).toBe("Line one.\nUpdated line two.\nLine three.");
  });

  test("replaceMemoryLines rejects invalid line numbers", async () => {
    const replaceMemoryLines = await toolHandler("replaceMemoryLines");
    await expect(
      replaceMemoryLines(
        { env, agentId: "agent", agentName: "Agent" },
        { namespace: "notes", key: "plan", changes: [[99, "nope"]] },
      ),
    ).rejects.toThrow(/out of range/);
  });
});
