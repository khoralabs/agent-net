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
import { createEphemeralRecentNamespacesTracker } from "../memories/_helpers/recent-namespaces.ts";
import {
  createTestEmbeddingModel,
  installTestMemoriesOntology,
  resetTestMemoriesOntology,
} from "../memories/_helpers/test-embedding.ts";
import { emptyDisabledToolSets, type HarnessToolkitEnv } from "../types.ts";
import { formatSkillDocument, SKILLS_NAMESPACE, skillRecordFromText } from "./_helpers/skills.ts";

type SkillToolName = "resolveSkills" | "replaceSkillLines";

type StoredSkill = {
  namespace: string;
  key: string;
  text: string;
};

function memoryIdFor(item: StoredSkill): string {
  return `memory:${item.namespace}/${item.key}`;
}

type MockSkillMemoriesClient = {
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

function createMockSkillClient(stored: StoredSkill[]): MockSkillMemoriesClient {
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
              _id: `source-${item.key}`,
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

describe("skill resolve / replace tools", () => {
  let stored: StoredSkill[];
  let env: HarnessToolkitEnv;

  beforeEach(() => {
    installTestMemoriesOntology();
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

  afterEach(() => {
    resetTestMemoriesOntology();
  });

  async function toolHandler(name: SkillToolName) {
    const { tools } = await evaluateComposable(harnessToolkit, { env });
    const spec = (tools as Partial<Record<SkillToolName, ToolSpec>>)[name];
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
    const typed = tools as Partial<Record<SkillToolName, ToolSpec>>;
    expect(typed.resolveSkills).toBeUndefined();
    expect(typed.replaceSkillLines).toBeUndefined();
  });

  test("resolveSkills returns text by default", async () => {
    const resolveSkills = await toolHandler("resolveSkills");
    const result = (await resolveSkills(
      { env, agentId: "agent", agentName: "Agent" },
      { keys: ["summarize-thread"] },
    )) as { results: Array<{ key: string; text?: string }> };

    expect(result.results[0]?.key).toBe("summarize-thread");
    expect(result.results[0]?.text).toContain("name: Summarize Thread");
    expect(result.results[0]?.text).toContain("Summarize the thread clearly.");
  });

  test("resolveSkills enumerates lines when requested", async () => {
    const resolveSkills = await toolHandler("resolveSkills");
    const result = (await resolveSkills(
      { env, agentId: "agent", agentName: "Agent" },
      { keys: ["summarize-thread"], enumerateLines: true },
    )) as { results: Array<{ key: string; lines?: Array<[number, string]> }> };

    expect(result.results[0]?.key).toBe("summarize-thread");
    expect(result.results[0]?.lines?.[0]).toEqual([1, "---"]);
    expect(result.results[0]?.lines?.some(([_, line]) => line === "name: Summarize Thread")).toBe(
      true,
    );
  });

  test("replaceSkillLines updates specific lines and persists merged text", async () => {
    const resolveSkills = await toolHandler("resolveSkills");
    const replaceSkillLines = await toolHandler("replaceSkillLines");

    const before = (await resolveSkills(
      { env, agentId: "agent", agentName: "Agent" },
      { keys: ["summarize-thread"], enumerateLines: true },
    )) as { results: Array<{ lines?: Array<[number, string]> }> };
    const bodyLine = before.results[0]?.lines?.find(([_, line]) => line === "Keep it concise.");
    expect(bodyLine).toBeDefined();

    const result = (await replaceSkillLines(
      { env, agentId: "agent", agentName: "Agent" },
      {
        key: "summarize-thread",
        changes: [[bodyLine?.[0] ?? 0, "Keep it brief and actionable."]],
      },
    )) as { key: string; memoryIds: string[]; lines: Array<[number, string]> };

    expect(result.memoryIds).toEqual([
      memoryIdFor({
        namespace: SKILLS_NAMESPACE,
        key: "summarize-thread",
        text: "",
      }),
    ]);
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
