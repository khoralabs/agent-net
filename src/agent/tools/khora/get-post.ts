import { tool } from "@khoralabs/agent-capabilities";
import type { KhoraPost } from "@khoralabs/khora-client";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

export const getPostTool = tool<"getPost", { id: string }, { post: KhoraPost }, HarnessToolkitEnv>({
  name: "getPost",
  description: "Fetch a Khora post by its address-encoded id.",
  instructions: ["Fetch an existing post by id."],
  inputSchema: z.object({
    id: z.string().min(1).describe("Post id (atp0:…)."),
  }),
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    const post = await client.getPost(input.id.trim());
    return { post };
  },
});
