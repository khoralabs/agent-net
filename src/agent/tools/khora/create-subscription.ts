import { tool } from "@khoralabs/agent-capabilities";
import { type KhoraPost, zKhoraStandingSearchRequest } from "@khoralabs/khora-contracts";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

export const createSubscriptionTool = tool<
  "createSubscription",
  {
    search: z.infer<typeof zKhoraStandingSearchRequest>;
    body?: string;
    topics?: string[];
    visibility?: "public" | "network" | "private";
    expiresAtMs?: number;
  },
  { post: KhoraPost },
  HarnessToolkitEnv
>({
  name: "createSubscription",
  description:
    "Create a standing-search subscription post. Requires a search spec describing what content to receive.",
  inputSchema: z.object({
    search: zKhoraStandingSearchRequest.describe(
      "Standing search spec: content (text or vector) and/or scope (namespace, labels, searchEntireDatabase).",
    ),
    body: z.string().max(100_000).optional().describe("Optional subscription description body."),
    topics: z.array(z.string().min(1)).optional().describe("Hashtag topic slugs."),
    visibility: z
      .enum(["public", "network", "private"])
      .optional()
      .describe("Who may read this subscription post. Defaults to public."),
    expiresAtMs: z.number().min(0).optional().describe("Optional expiry timestamp (Unix ms)."),
  }),
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    const post = await client.createSubscription({
      search: input.search,
      visibility: input.visibility ?? "public",
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.topics !== undefined ? { topics: input.topics } : {}),
      ...(input.expiresAtMs !== undefined ? { expiresAtMs: input.expiresAtMs } : {}),
    });
    return { post };
  },
});
