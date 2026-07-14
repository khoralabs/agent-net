import { beforeEach, describe, expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@khoralabs/agent-capabilities";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { SearchHit, SearchParams } from "@khoralabs/memories-core";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";
import { harnessToolkit } from "../_toolkit.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { formatSkillDocument, SKILLS_NAMESPACE, skillRecordFromText } from "./_helpers/skills.ts";

type SkillLineToolName = "readSkillLines" | "replaceSkillLines";

type StoredSkill = {
  namespace: string;
  key: string;
  text: string;
};

type MockSkillMemoriesClient = {
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

function createMockSkillClient(stored: StoredSkill[]): MockSkillMemoriesClient {
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
              _id: `source-${item.key}`,
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
        const key = sourceMapId.replace("source-", "");
        return stored.find((item) => item.key === key)?.text ?? null;
      },
    },
  };
}

describe("skill line tools", () => {
  let stored: StoredSkill[];
  let env: HarnessToolkitEnv;

  beforeEach(() => {
    stored = [
      {
        namespace: SKILLS_NAMESPACE,
        key: "summarize-thread",
        text: formatSkillDocument(
          "Summarize Thread",
          "Summarize a chat thread",
          "Summarize the thread clearly.\nKeep it concise.",
        ),
      },
    ];
    env = createEnv({
      memoriesClient: createMockSkillClient(stored) as unknown as RemoteMemoriesClientAsync,
      skills: [skillRecordFromText(SKILLS_NAMESPACE, "summarize-thread", stored[0]?.text ?? "")],
    });
  });

  async function toolHandler(name: SkillLineToolName) {
    const { tools } = await evaluateComposable(harnessToolkit, { env });
    const spec = (tools as Partial<Record<SkillLineToolName, ToolSpec>>)[name];
    if (spec === undefined) throw new Error(`tool not available: ${name}`);
    return spec.handler.bind(spec) as (
      ctx: ToolRuntimeContext<HarnessToolkitEnv>,
      input: unknown,
    ) => Promise<unknown>;
  }

  test("skill line tools are hidden when memories client is not configured", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv(),
    });
    const typed = tools as Partial<Record<SkillLineToolName, ToolSpec>>;
    expect(typed.readSkillLines).toBeUndefined();
    expect(typed.replaceSkillLines).toBeUndefined();
  });

  test("readSkillLines returns numbered tuples for full skill document", async () => {
    const readSkillLines = await toolHandler("readSkillLines");
    const result = (await readSkillLines(
      { env, agentId: "agent", agentName: "Agent" },
      { key: "summarize-thread" },
    )) as { key: string; lines: Array<[number, string]> };

    expect(result.key).toBe("summarize-thread");
    expect(result.lines[0]).toEqual([1, "---"]);
    expect(result.lines.some(([_, line]) => line === "name: Summarize Thread")).toBe(true);
    expect(result.lines.some(([_, line]) => line === "Summarize the thread clearly.")).toBe(true);
  });

  test("replaceSkillLines updates specific lines and persists merged text", async () => {
    const readSkillLines = await toolHandler("readSkillLines");
    const replaceSkillLines = await toolHandler("replaceSkillLines");

    const before = (await readSkillLines(
      { env, agentId: "agent", agentName: "Agent" },
      { key: "summarize-thread" },
    )) as { lines: Array<[number, string]> };
    const bodyLine = before.lines.find(([_, line]) => line === "Keep it concise.");
    expect(bodyLine).toBeDefined();

    const result = (await replaceSkillLines(
      { env, agentId: "agent", agentName: "Agent" },
      {
        key: "summarize-thread",
        changes: [[bodyLine?.[0] ?? 0, "Keep it brief and actionable."]],
      },
    )) as { key: string; memoryIds: string[]; lines: Array<[number, string]> };

    expect(result.memoryIds).toEqual(["memory-1"]);
    expect(result.lines.some(([_, line]) => line === "Keep it brief and actionable.")).toBe(true);
    expect(stored[0]?.text).toContain("Keep it brief and actionable.");
    expect(env.skills[0]?.body).toContain("Keep it brief and actionable.");
  });

  test("replaceSkillLines rejects invalid line numbers", async () => {
    const replaceSkillLines = await toolHandler("replaceSkillLines");
    await expect(
      replaceSkillLines(
        { env, agentId: "agent", agentName: "Agent" },
        { key: "summarize-thread", changes: [[999, "nope"]] },
      ),
    ).rejects.toThrow(/out of range/);
  });
});
