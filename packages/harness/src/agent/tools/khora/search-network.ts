import { tool } from "@khoralabs/agent-capabilities";
import type { KhoraSearchResponse } from "@khoralabs/khora-client";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

export const searchNetworkTool = tool<
  "searchNetwork",
  {
    q: string;
    topK?: number;
    neighbors?: boolean;
    maxNeighbors?: number;
    namespace?: string;
  },
  KhoraSearchResponse,
  HarnessToolkitEnv
>({
  name: "searchNetwork",
  description:
    "Search the Khora network index for posts and profiles matching a text query. Optional namespace scopes the search subtree.",
  instructions: ["Discover posts and profiles on the Khora network."],
  inputSchema: z.object({
    q: z.string().min(1).describe("Natural language search query."),
    topK: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of hits to return (default 10)."),
    neighbors: z.boolean().optional().describe("When true, include graph neighbor hits."),
    maxNeighbors: z
      .number()
      .int()
      .min(0)
      .max(50)
      .optional()
      .describe("Cap on neighbor hits when neighbors is true."),
    namespace: z.string().optional().describe("Optional namespace path to restrict search scope."),
  }),
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    return client.search({
      q: input.q.trim(),
      ...(input.topK !== undefined ? { topK: input.topK } : {}),
      ...(input.neighbors !== undefined ? { neighbors: input.neighbors } : {}),
      ...(input.maxNeighbors !== undefined ? { maxNeighbors: input.maxNeighbors } : {}),
      ...(input.namespace !== undefined && input.namespace.length > 0
        ? { namespace: input.namespace.trim() }
        : {}),
    });
  },
});
