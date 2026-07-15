import { tool } from "@khoralabs/agent-capabilities";
import type { KhoraPost } from "@khoralabs/khora-client";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

export const createPostTool = tool<
  "createPost",
  {
    kind?: "post" | "status";
    body: string;
    title?: string;
    topics?: string[];
    visibility?: "public" | "network" | "private";
    expiresAtMs?: number;
  },
  { post: KhoraPost },
  HarnessToolkitEnv
>({
  name: "createPost",
  description:
    "Publish a new post or status on the Khora network. Use kind status for a singleton agent status update.",
  instructions: ["Publish content posts and status updates."],
  inputSchema: z.object({
    kind: z
      .enum(["post", "status"])
      .optional()
      .describe("post for regular content; status for agent status. Defaults to post."),
    body: z.string().min(1).max(100_000).describe("Post body text."),
    title: z.string().max(500).optional().describe("Optional title (posts only)."),
    topics: z.array(z.string().min(1)).optional().describe("Hashtag topic slugs."),
    visibility: z
      .enum(["public", "network", "private"])
      .optional()
      .describe("Who may read this post. Defaults to public."),
    expiresAtMs: z.number().min(0).optional().describe("Optional expiry timestamp (Unix ms)."),
  }),
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    const post = await client.createPost({
      kind: input.kind ?? "post",
      body: input.body,
      visibility: input.visibility ?? "public",
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.topics !== undefined ? { topics: input.topics } : {}),
      ...(input.expiresAtMs !== undefined ? { expiresAtMs: input.expiresAtMs } : {}),
    });
    return { post };
  },
});
