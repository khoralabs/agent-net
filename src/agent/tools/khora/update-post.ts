import { tool } from "@khoralabs/agent-capabilities";
import { type KhoraPost, zKhoraStandingSearchRequest } from "@khoralabs/khora-client";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

const zPostVisibility = z.enum(["public", "network", "private"]);

const zUpdatePostInput = z.object({
  id: z.string().min(1).describe("Post id to update."),
  kind: z.enum(["post", "status", "subscription"]).optional(),
  topics: z.array(z.string().min(1)).optional(),
  visibility: zPostVisibility.optional(),
  expiresAtMs: z.number().min(0).optional(),
  title: z.string().max(500).optional(),
  body: z.string().max(100_000).optional(),
  search: zKhoraStandingSearchRequest.optional(),
});

export const updatePostTool = tool<
  "updatePost",
  z.infer<typeof zUpdatePostInput>,
  { post: KhoraPost },
  HarnessToolkitEnv
>({
  name: "updatePost",
  description: "Update an existing Khora post owned by this agent.",
  inputSchema: zUpdatePostInput,
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    const { id, ...patch } = input;
    const post = await client.updatePost(id.trim(), patch);
    return { post };
  },
});
