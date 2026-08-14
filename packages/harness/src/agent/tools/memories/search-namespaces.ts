import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import {
  type EnrichedNamespaceSearchResult,
  runStandardNamespaceSearch,
} from "./_helpers/memory-search.ts";
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";

export const searchNamespacesTool = tool<
  "searchNamespaces",
  { query: string; under?: string; contentRanking?: boolean },
  EnrichedNamespaceSearchResult,
  HarnessToolkitEnv
>({
  name: "searchNamespaces",
  description:
    "Discover namespaces by natural-language query. Namespaces are slash-separated paths (parent/child hierarchy); each hit includes lineage (root→leaf), alias, and description. Ranking defaults to memory content in each namespace, with a lexical boost from alias/description/path. Set contentRanking=false for metadata-only discovery. Use under to restrict to a subtree. Then call searchMemories with a chosen namespace.",
  instructions: [
    "Discover relevant namespaces with searchNamespaces before searchMemories when the path is unknown.",
    "Namespaces are hierarchical slash paths; use under to search within a subtree.",
    "Prefer contentRanking (default) so namespaces with relevant memories rank highest; use contentRanking=false to match alias/description/path only.",
  ],
  inputSchema: z.object({
    query: z.string().min(1).describe("Natural language query for namespace discovery."),
    under: z
      .string()
      .min(1)
      .optional()
      .describe("Optional namespace path filter; only return namespaces under this subtree."),
    contentRanking: z
      .boolean()
      .optional()
      .describe(
        "When true (default), rank by memory content hits plus metadata. When false, lexical metadata/path only.",
      ),
  }),
  policies: [hasMemoriesClient, toolEnabled("searchNamespaces")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const under = input.under?.trim();
    const result = await runStandardNamespaceSearch(client, {
      query: input.query.trim(),
      ...(under !== undefined && under.length > 0 ? { under } : {}),
      ...(input.contentRanking !== undefined ? { contentRanking: input.contentRanking } : {}),
      embeddingModel: ctx.env.embeddingModel,
      embeddingCache: ctx.env.embeddingCache,
      requireEmbedding: input.contentRanking !== false,
    });

    await touchRecentNamespaces(
      ctx.env.recentNamespaces,
      result.namespaces.map((hit) => hit.namespace),
    );

    return result;
  },
});
