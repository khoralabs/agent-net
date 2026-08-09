import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@khoralabs/agent-capabilities";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import {
  ids,
  type MergeMemoryParamsNode,
  type SearchHit,
  type SearchOutput,
  type SearchParams,
} from "@khoralabs/memories-node";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";
import { harnessToolkit } from "./_toolkit.ts";
import { createEphemeralRecentNamespacesTracker } from "./memories/_helpers/recent-namespaces.ts";
import {
  createTestEmbeddingModel,
  installTestMemoriesOntology,
  resetTestMemoriesOntology,
} from "./memories/_helpers/test-embedding.ts";
import {
  defaultSkillKey,
  formatSkillDocument,
  SKILLS_NAMESPACE,
  skillRecordFromText,
} from "./skills/_helpers/skills.ts";
import { activateSkillByName } from "./skills/activate-skill.ts";
import { emptyDisabledToolSets, type HarnessToolkitEnv } from "./types.ts";

type HarnessToolName = "writeMemory" | "writeSkill" | "searchMemories" | "listNamespaces";

type MergedMemory = {
  namespace: string;
  key: string;
  text: string;
  links: Array<{
    namespace: string;
    key: string;
    direction?: "in" | "out";
    label?: string;
  }>;
};

type MockHarnessMemoriesClient = {
  mergeMemory: (params: MergeMemoryParamsNode) => Promise<string[]>;
  search: (params: SearchParams) => Promise<SearchOutput>;
  persistence: {
    findMemoryIdByKey: (namespace: string, key: string) => Promise<string | undefined>;
    getSourceMapTextPreview: (sourceMapId: string, maxChars?: number) => Promise<string | null>;
    listMemoryNamespaces: () => Promise<string[]>;
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

function createMockMemoriesClient(merged: MergedMemory[]): MockHarnessMemoriesClient {
  return {
    mergeMemory: async (params) => {
      const text = params.content
        .map((item) => (typeof item.text === "string" ? item.text : ""))
        .filter((t) => t.length > 0)
        .join("\n\n");
      merged.push({
        namespace: params.namespace,
        key: params.key,
        text,
        links:
          params.edges?.map((edge) => ({
            namespace: edge.peer_memory_id.split("_")[0] ?? "",
            key: edge.peer_memory_id,
            direction: edge.direction,
            label: edge.label.kind,
          })) ?? [],
      });
      return [params.key];
    },
    search: async (params) => {
      const query = "text" in params.content ? params.content.text : "";
      return {
        hits: merged
          .filter(
            (item) =>
              item.namespace.startsWith(params.namespace) &&
              (item.key.includes(query) || item.text.includes(query)),
          )
          .map(
            (item, index) =>
              ({
                id: `source-${index}`,
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
      };
    },
    persistence: {
      findMemoryIdByKey: async (namespace, key) => {
        const item = merged.find((row) => row.namespace === namespace && row.key === key);
        return item !== undefined ? ids.memory(namespace, key) : undefined;
      },
      getSourceMapTextPreview: async (sourceMapId) => {
        for (const item of merged) {
          const memoryId = ids.memory(item.namespace, item.key);
          if (sourceMapId === ids.sourceMap(memoryId, "text:0")) return item.text;
        }
        return null;
      },
      listMemoryNamespaces: async () =>
        [...new Set(merged.map((item) => item.namespace))].sort((a, b) => a.localeCompare(b)),
    },
  };
}

describe("harness memory tools", () => {
  let merged: MergedMemory[];
  let env: HarnessToolkitEnv;

  beforeEach(() => {
    installTestMemoriesOntology();
    merged = [];
    env = createEnv({
      memoriesClient: createMockMemoriesClient(merged) as unknown as RemoteMemoriesClientAsync,
    });
  });

  afterEach(() => {
    resetTestMemoriesOntology();
  });

  async function toolHandler(name: HarnessToolName) {
    const { tools } = await evaluateComposable(harnessToolkit, { env });
    const spec = (tools as Partial<Record<HarnessToolName, ToolSpec>>)[name];
    if (spec === undefined) throw new Error(`tool not available: ${name}`);
    return spec.handler.bind(spec) as (
      ctx: ToolRuntimeContext<HarnessToolkitEnv>,
      input: unknown,
    ) => Promise<unknown>;
  }

  test("writeMemory persists content in the requested namespace", async () => {
    const writeMemory = await toolHandler("writeMemory");
    const result = (await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "notes", key: "plan", text: "Ship the harness." },
    )) as { memoryIds: string[] };
    expect(result.memoryIds).toEqual([ids.memory("notes", "plan")]);
    expect(merged).toEqual([
      { namespace: "notes", key: "plan", text: "Ship the harness.", links: [] },
    ]);
  });

  test("writeMemory accepts graph links to peer memories", async () => {
    const writeMemory = await toolHandler("writeMemory");
    await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "notes", key: "base", text: "Base note." },
    );

    await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      {
        namespace: "notes",
        key: "linked",
        text: "Linked note.",
        links: [{ namespace: "notes", key: "base" }],
      },
    );

    expect(merged[1]?.links.length).toBe(1);
  });

  test("writeMemory returns error result for invalid nodeLabels", async () => {
    const writeMemory = await toolHandler("writeMemory");
    const result = (await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      {
        namespace: "notes",
        key: "bad-fact",
        text: "CFD means Coffee Fueled Dev.",
        nodeLabels: { fact: { term: "CFD", category: "marketing" } },
      },
    )) as { memoryIds: string[]; error?: string };
    expect(result.memoryIds).toEqual([]);
    expect(result.error).toMatch(/nodeLabels\.fact|invalid|Unknown|fact/i);
    expect(merged).toHaveLength(0);
  });

  test("writeSkill stores skill frontmatter in the _skills_ namespace", async () => {
    const writeSkill = await toolHandler("writeSkill");
    const result = (await writeSkill(
      { env, agentId: "agent", agentName: "Agent" },
      {
        name: "Summarize Thread",
        description: "Summarize a chat thread",
        body: "Summarize the thread clearly.",
      },
    )) as { key: string };
    expect(result.key).toBe(defaultSkillKey("Summarize Thread"));
    expect(merged[0]).toMatchObject({
      namespace: SKILLS_NAMESPACE,
      text: formatSkillDocument(
        "Summarize Thread",
        "Summarize a chat thread",
        "Summarize the thread clearly.",
      ),
    });
    expect(env.skills).toHaveLength(1);
  });

  test("writeSkill links to other skills via graph edges", async () => {
    const writeSkill = await toolHandler("writeSkill");
    await writeSkill(
      { env, agentId: "agent", agentName: "Agent" },
      {
        name: "Base Skill",
        description: "Base",
        body: "Base body.",
        key: "base-skill",
      },
    );

    await writeSkill(
      { env, agentId: "agent", agentName: "Agent" },
      {
        name: "Follow Up",
        description: "Follow up",
        body: "Follow up body.",
        key: "follow-up",
        linksTo: ["base-skill"],
      },
    );

    expect(merged[1]?.links.length).toBe(1);
  });

  test("searchMemories returns hits from the agent memory db", async () => {
    const writeMemory = await toolHandler("writeMemory");
    const searchMemories = await toolHandler("searchMemories");

    await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "notes", key: "plan", text: "Ship the harness." },
    );

    const result = (await searchMemories(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "notes", query: "harness" },
    )) as { hits: Array<{ memory_key: string }> };
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0]?.memory_key).toBe("plan");
  });

  test("listNamespaces returns distinct namespaces from the memory db", async () => {
    const writeMemory = await toolHandler("writeMemory");
    const listNamespaces = await toolHandler("listNamespaces");

    await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "notes", key: "a", text: "A" },
    );
    await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "inbox", key: "b", text: "B" },
    );

    const before = [...env.recentNamespaces.top()];
    const result = (await listNamespaces({ env, agentId: "agent", agentName: "Agent" }, {})) as {
      namespaces: Array<{
        namespace: string;
        alias: string | null;
        description: string;
      }>;
    };
    expect(result.namespaces.map((n) => n.namespace)).toEqual(["inbox", "notes"]);
    expect(result.namespaces.every((n) => n.alias === null && n.description === "")).toBe(true);
    expect(env.recentNamespaces.top()).toEqual(before);
  });

  test("writeMemory and searchMemories update recentNamespaces MRU", async () => {
    const writeMemory = await toolHandler("writeMemory");
    const searchMemories = await toolHandler("searchMemories");

    await writeMemory(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "notes", key: "plan", text: "Ship the harness." },
    );
    expect(env.recentNamespaces.top()).toEqual(["notes"]);

    await searchMemories(
      { env, agentId: "agent", agentName: "Agent" },
      { namespace: "inbox", query: "missing" },
    );
    expect(env.recentNamespaces.top()[0]).toBe("inbox");
    expect(env.recentNamespaces.top()).toContain("notes");
  });

  test("searchMemories fails loud when embeddingModel is missing", async () => {
    const searchMemories = await toolHandler("searchMemories");
    const bare = createEnv({
      embeddingModel: undefined,
      memoriesClient: env.memoriesClient,
    });
    await expect(
      searchMemories(
        { env: bare, agentId: "agent", agentName: "Agent" },
        { namespace: "notes", query: "company products" },
      ),
    ).rejects.toThrow(/AI_GATEWAY_API_KEY/);
  });

  test("activateSkill resolves skill content from the _skills_ namespace", async () => {
    const skillBody = `---
name: summarize-thread
description: Summarize a chat thread
---
Summarize the thread clearly.`;
    env.skills = [skillRecordFromText(SKILLS_NAMESPACE, "summarize-thread", skillBody)];

    const result = await activateSkillByName(env, "summarize-thread");
    expect(result.alreadyActive).toBe(false);
    expect(result.content).toContain("Summarize the thread clearly.");

    const again = await activateSkillByName(env, "summarize-thread");
    expect(again.alreadyActive).toBe(true);
    expect(again.content).toBeUndefined();
  });
});
