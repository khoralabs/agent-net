import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import type { HarnessToolkitEnv } from "../types.ts";
import { hasKhoraClient } from "./policies.ts";

export const deletePostTool = tool<
  "deletePost",
  { id: string },
  { deleted: true },
  HarnessToolkitEnv
>({
  name: "deletePost",
  description: "Delete a Khora post owned by this agent.",
  inputSchema: z.object({
    id: z.string().min(1).describe("Post id to delete."),
  }),
  policies: [hasKhoraClient],
  handler: async (ctx, input) => {
    const client = ctx.env.khoraClient;
    if (client === undefined) throw new Error("khora client is not configured");

    await client.deletePost(input.id.trim());
    return { deleted: true as const };
  },
});
