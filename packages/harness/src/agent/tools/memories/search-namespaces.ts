import { tool } from "@khoralabs/agent-capabilities";
import type { NamespaceSearchResult } from "@khoralabs/memories-node/helpers";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { runStandardNamespaceSearch } from "./_helpers/memory-search.ts";
import { touchRecentNamespaces } from "./_helpers/recent-namespaces.ts";

export const searchNamespacesTool = tool<
  "searchNamespaces",
  { query: string; under?: string },
  NamespaceSearchResult,
  HarnessToolkitEnv
>({
  name: "searchNamespaces",
  description:
    "Search for namespaces in the agent's memory database by natural-language query (suppressed namespaces are omitted). Prefer this over listNamespaces when discovering where to search; use listNamespaces only for a full inventory.",
  instructions: [
    "Discover relevant namespaces before searchMemories when the path is unknown.",
    "Prefer searchNamespaces over listNamespaces when the catalog may be large.",
  ],
  inputSchema: z.object({
    query: z.string().min(1).describe("Natural language query for namespace discovery."),
    under: z
      .string()
      .min(1)
      .optional()
      .describe("Optional namespace path filter; only return namespaces under this subtree."),
  }),
  policies: [hasMemoriesClient, toolEnabled("searchNamespaces")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const under = input.under?.trim();
    const result = await runStandardNamespaceSearch(client, {
      query: input.query.trim(),
      ...(under !== undefined && under.length > 0 ? { under } : {}),
      embeddingModel: ctx.env.embeddingModel,
      embeddingCache: ctx.env.embeddingCache,
      requireEmbedding: true,
    });

    await touchRecentNamespaces(
      ctx.env.recentNamespaces,
      result.namespaces.map((hit) => hit.namespace),
    );

    return result;
  },
});
