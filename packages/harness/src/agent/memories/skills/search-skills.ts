import { tool } from "@khoralabs/agent-capabilities";
import type { MemorySearchHit } from "@khoralabs/memories-node/helpers";
import { z } from "zod";
import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../../turn/tools/policies.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import {
  MEMORY_SEARCH_SCOPE_EXACT,
  runStandardHybridMemorySearch,
} from "../tools/_helpers/memory-search.ts";
import { touchRecentNamespaces } from "../tools/_helpers/recent-namespaces.ts";
import { SKILLS_NAMESPACE } from "./_helpers/skills.ts";

export const searchSkillsTool = tool<
  "searchSkills",
  { query: string },
  { hits: MemorySearchHit[]; namespace: string },
  HarnessToolkitEnv
>({
  name: "searchSkills",
  description:
    "Search skills stored in the _skills_ memory namespace. Provide a natural-language query; results use the same hybrid fulltext+vector search as searchMemories.",
  instructions: ["Recall relevant skills from the _skills_ namespace before activating one."],
  inputSchema: z.object({
    query: z.string().min(1).describe("Natural language search query over skills."),
  }),
  policies: [hasMemoriesClient, toolEnabled("searchSkills")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const hits = await runStandardHybridMemorySearch(client, {
      namespace: SKILLS_NAMESPACE,
      query: input.query.trim(),
      embeddingModel: ctx.env.embeddingModel,
      embeddingCache: ctx.env.embeddingCache,
      searchScopeMode: MEMORY_SEARCH_SCOPE_EXACT,
    });

    await touchRecentNamespaces(ctx.env.recentNamespaces, [SKILLS_NAMESPACE]);

    return { hits, namespace: SKILLS_NAMESPACE };
  },
});
