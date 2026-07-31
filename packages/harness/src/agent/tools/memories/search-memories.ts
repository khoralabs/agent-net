import { tool } from "@khoralabs/agent-capabilities";
import type { MemorySearchHit } from "@khoralabs/memories-node/helpers";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { runStandardHybridMemorySearch } from "./_helpers/memory-search.ts";
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";

export const searchMemoriesTool = tool<
  "searchMemories",
  { namespace: string; query: string },
  { hits: MemorySearchHit[] },
  HarnessToolkitEnv
>({
  name: "searchMemories",
  description:
    "Search the agent's memory database within a namespace subtree. Provide the namespace path and a natural-language query.",
  instructions: ["Recall relevant context from the agent's memory database."],
  inputSchema: z.object({
    namespace: z.string().min(1).describe("Memory namespace subtree to search."),
    query: z.string().min(1).describe("Natural language search query."),
  }),
  policies: [hasMemoriesClient, toolEnabled("searchMemories")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const namespace = input.namespace.trim();
    const hits = await runStandardHybridMemorySearch(client, {
      namespace,
      query: input.query.trim(),
      embeddingModel: ctx.env.embeddingModel,
      embeddingCache: ctx.env.embeddingCache,
      requireEmbedding: true,
      neighbors: "all",
      maxNeighbors: 5,
      topK: 10,
    });

    await touchRecentNamespaces(ctx.env.recentNamespaces, [
      ...hits.map((hit) => hit.namespace),
      namespace,
    ]);

    return { hits };
  },
});
