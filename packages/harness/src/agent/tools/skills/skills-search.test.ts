import { describe, expect, test } from "bun:test";
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
import {
  discoverSkillsFromMemories,
  formatSkillDocument,
  SKILLS_NAMESPACE,
} from "./_helpers/skills.ts";

type StoredSkill = {
  namespace: string;
  key: string;
  text: string;
};

function memoryIdFor(item: StoredSkill): string {
  return `memory:${item.namespace}/${item.key}`;
}

function createMockSkillClient(stored: StoredSkill[]): RemoteMemoriesClientAsync {
  return {
    search: async (params: SearchParams): Promise<SearchOutput> => {
      const queryText =
        "text" in params.content && typeof params.content.text === "string"
          ? params.content.text
          : "";
      return {
        hits: stored
          .filter(
            (item) =>
              item.namespace === params.namespace ||
              item.namespace.startsWith(`${params.namespace}/`),
          )
          .filter(
            (item) =>
              queryText.length === 0 ||
              item.text.includes(queryText) ||
              item.key.includes(queryText),
          )
          .map(
            (item, index) =>
              ({
                _id: ids.sourceMap(memoryIdFor(item), "text"),
                score: 1,
                source_key: "text",
                memory: {
                  id: memoryIdFor(item),
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
      findMemoryIdByKey: async (namespace: string, key: string) => {
        const item = stored.find((row) => row.namespace === namespace && row.key === key);
        return item !== undefined ? memoryIdFor(item) : undefined;
      },
      getSourceMapTextPreview: async (sourceMapId: string) => {
        for (const item of stored) {
          if (ids.sourceMap(memoryIdFor(item), "text") === sourceMapId) {
            return item.text;
          }
        }
        return null;
      },
    },
  } as unknown as RemoteMemoriesClientAsync;
}

describe("discoverSkillsFromMemories / searchSkills", () => {
  test("discoverSkillsFromMemories parses skill frontmatter via hybrid search", async () => {
    const stored: StoredSkill[] = [
      {
        namespace: SKILLS_NAMESPACE,
        key: "alpha",
        text: formatSkillDocument("Alpha", "First skill", "Do alpha."),
      },
      {
        namespace: SKILLS_NAMESPACE,
        key: "noise",
        text: "not a skill document",
      },
    ];
    const client = createMockSkillClient(stored);
    const skills = await discoverSkillsFromMemories(client, {
      embeddingModel: createTestEmbeddingModel(),
      embeddingCache: new Map(),
    });
    expect(skills.map((s) => s.key)).toEqual(["alpha"]);
    expect(skills[0]?.name).toBe("Alpha");
  });

  test("searchSkills scopes hybrid search to the skills namespace", async () => {
    installTestMemoriesOntology();
    try {
      const stored: StoredSkill[] = [
        {
          namespace: SKILLS_NAMESPACE,
          key: "beta",
          text: formatSkillDocument("Beta", "Second", "name: Beta\nDo beta."),
        },
      ];
      const env: HarnessToolkitEnv = {
        skills: [],
        activatedSkillNames: new Set(),
        embeddingCache: new Map(),
        embeddingModel: createTestEmbeddingModel(),
        recentNamespaces: createEphemeralRecentNamespacesTracker(),
        memoriesClient: createMockSkillClient(stored),
        ...emptyDisabledToolSets(),
      };

      const { tools } = await evaluateComposable(harnessToolkit, { env });
      const spec = (tools as Partial<Record<"searchSkills", ToolSpec>>).searchSkills;
      if (spec === undefined) throw new Error("searchSkills tool not available");
      const handler = spec.handler.bind(spec) as (
        ctx: ToolRuntimeContext<HarnessToolkitEnv>,
        input: unknown,
      ) => Promise<{ hits: Array<{ memory_key: string }>; namespace: string }>;

      const result = await handler(
        { env, agentId: "agent", agentName: "Agent" },
        { query: "name:" },
      );
      expect(result.namespace).toBe(SKILLS_NAMESPACE);
      expect(result.hits.some((h) => h.memory_key === "beta")).toBe(true);
    } finally {
      resetTestMemoriesOntology();
    }
  });
});
