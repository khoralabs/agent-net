import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import type { HarnessToolkitEnv } from "../types.ts";
import { emitChatNetworkEvent } from "./_helpers/network-events.ts";
import { hasAgentChat } from "./policies.ts";

export const createAgentThreadTool = tool<
  "createAgentThread",
  { participants?: Array<{ did: string; role?: string }>; title?: string },
  { threadId: string },
  HarnessToolkitEnv
>({
  name: "createAgentThread",
  description: "Create a new chat thread and optionally grant access to other agents.",
  inputSchema: z.object({
    participants: z
      .array(
        z.object({
          did: z.string().min(1),
          role: z.string().min(1).optional(),
        }),
      )
      .optional(),
    title: z.string().min(1).optional(),
  }),
  policies: [hasAgentChat],
  handler: async (ctx, input) => {
    const chat = ctx.env.agentChat;
    if (chat === undefined) throw new Error("agent chat is not configured");
    const thread = await chat.createThread({
      metadata: input.title ? { title: input.title } : undefined,
      participants: (input.participants ?? []).map((participant) => ({
        scope: { type: "agent", id: participant.did },
        role: participant.role,
      })),
    });
    await emitChatNetworkEvent({
      env: ctx.env,
      kind: "chat.thread.created",
      payload: {
        threadId: thread.id,
        title: input.title,
        participants: input.participants,
      },
      extra: thread.id,
    });
    return { threadId: thread.id };
  },
});
