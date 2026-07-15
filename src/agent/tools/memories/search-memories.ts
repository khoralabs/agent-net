import { tool } from "@khoralabs/agent-capabilities";
import { type MemorySearchHit, runHybridMemorySearch } from "@khoralabs/memories-core/helpers";
import { z } from "zod";
import { hasMemoriesClient } from "../policies";
import type { HarnessToolkitEnv } from "../types";

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
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const hits = await runHybridMemorySearch(
      client,
      {
        namespace: input.namespace.trim(),
        embeddingModel: ctx.env.embeddingModel,
        embeddingCache: ctx.env.embeddingCache,
        memoriesSnapshotRootHex: ctx.env.memoriesSnapshotRootHex,
      },
      {
        content: { text: input.query.trim() },
        options: {
          topK: 12,
          neighbors: "off",
          arms: ctx.env.embeddingModel ? undefined : { lexical: 1, vector: 0 },
        },
      },
    );

    return { hits };
  },
});
