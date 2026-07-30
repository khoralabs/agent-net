import { tool } from "@khoralabs/agent-capabilities";
import { type MemorySearchHit, runHybridMemorySearch } from "@khoralabs/memories-node/helpers";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";
import { touchRecentNamespaces } from "../memories/_helpers/recent-namespaces.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { SKILLS_NAMESPACE } from "./_helpers/skills.ts";

export const searchSkillsTool = tool<
  "searchSkills",
  { query: string },
  { hits: MemorySearchHit[]; namespace: string },
  HarnessToolkitEnv
>({
  name: "searchSkills",
  description:
    "Search skills stored in the _root_/_skills_ memory namespace. Provide a natural-language query; results use the same hybrid fulltext+vector search as searchMemories.",
  instructions: [
    "Recall relevant skills from the _root_/_skills_ namespace before activating one.",
  ],
  inputSchema: z.object({
    query: z.string().min(1).describe("Natural language search query over skills."),
  }),
  policies: [hasMemoriesClient, toolEnabled("searchSkills")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const hits = await runHybridMemorySearch(
      client,
      {
        namespace: SKILLS_NAMESPACE,
        embeddingModel: ctx.env.embeddingModel,
        embeddingCache: ctx.env.embeddingCache,
        memoriesSnapshotRootHex: ctx.env.memoriesSnapshotRootHex,
      },
      {
        content: { text: input.query.trim() },
        searchScopeMode: "exactScope",
        options: {
          topK: 12,
          neighbors: "off",
          arms: ctx.env.embeddingModel ? undefined : { lexical: 1, vector: 0 },
        },
      },
    );

    await touchRecentNamespaces(ctx.env.recentNamespaces, [SKILLS_NAMESPACE]);

    return { hits, namespace: SKILLS_NAMESPACE };
  },
});
