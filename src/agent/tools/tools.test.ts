import { beforeEach, describe, expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@khoralabs/agent-capabilities";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { MergeMemoryParamsNode, SearchHit, SearchParams } from "@khoralabs/memories-core";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";
import { harnessToolkit } from "./_toolkit.ts";
import {
  defaultSkillKey,
  formatSkillDocument,
  SKILLS_NAMESPACE,
  skillRecordFromText,
} from "./skills/_helpers/skills.ts";
import { activateSkillByName } from "./skills/activate-skill.ts";
import type { HarnessToolkitEnv } from "./types.ts";

type HarnessToolName = "writeMemory" | "writeSkill" | "searchMemories";

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

function createMockMemoriesClient(merged: MergedMemory[]): MockHarnessMemoriesClient {
  return {
    mergeMemory: async (params) => {
      const text = params.content.find((item) => item.key === "text")?.text ?? "";
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
      return ["memory-1"];
    },
    search: async (params) => {
      const query = "text" in params.content ? params.content.text : "";
      return merged
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
        );
    },
    persistence: {
      findMemoryIdByKey: async (namespace, key) =>
        merged.some((item) => item.namespace === namespace && item.key === key)
          ? "memory-1"
          : undefined,
      getSourceMapTextPreview: async (sourceMapId) => {
        const index = Number.parseInt(sourceMapId.replace("source-", ""), 10);
        return merged[index]?.text ?? null;
      },
    },
  };
}

describe("harness memory tools", () => {
  let merged: MergedMemory[];
  let env: HarnessToolkitEnv;

  beforeEach(() => {
    merged = [];
    env = createEnv({
      memoriesClient: createMockMemoriesClient(merged) as unknown as RemoteMemoriesClientAsync,
    });
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
    expect(result.memoryIds).toEqual(["memory-1"]);
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

  test("writeSkill stores skill frontmatter in the skills namespace", async () => {
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

  test("activateSkill resolves skill content from the skills namespace", async () => {
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
