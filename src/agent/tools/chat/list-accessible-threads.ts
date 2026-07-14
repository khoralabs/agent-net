import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import type { HarnessToolkitEnv } from "../types.ts";
import { hasAgentChat } from "./policies.ts";

export const listAccessibleThreadsTool = tool<
  "listAccessibleThreads",
  { limit?: number },
  { threads: Array<{ id: string; metadata?: Record<string, unknown> }> },
  HarnessToolkitEnv
>({
  name: "listAccessibleThreads",
  description: "List chat threads this agent can access.",
  inputSchema: z.object({
    limit: z.number().int().positive().max(100).optional(),
  }),
  policies: [hasAgentChat],
  handler: async (ctx, input) => {
    const chat = ctx.env.agentChat;
    if (chat === undefined) throw new Error("agent chat is not configured");
    const page = await chat.listThreads({ limit: input.limit });
    return {
      threads: page.items.map((thread) => ({
        id: thread.id,
        metadata: thread.metadata as Record<string, unknown> | undefined,
      })),
    };
  },
});
