import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import type { HarnessToolkitEnv } from "../types.ts";
import { emitChatNetworkEvent } from "./_helpers/network-events.ts";
import { hasAgentChat } from "./policies.ts";

export const sendThreadMessageTool = tool<
  "sendThreadMessage",
  { threadId: string; text: string; role?: "user" | "assistant" | "system" },
  { postId: string; threadId: string },
  HarnessToolkitEnv
>({
  name: "sendThreadMessage",
  description: "Send a signed message to an accessible chat thread.",
  instructions: ["Post signed messages to peer threads."],
  inputSchema: z.object({
    threadId: z.string().min(1),
    text: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]).optional(),
  }),
  policies: [hasAgentChat],
  handler: async (ctx, input) => {
    const chat = ctx.env.agentChat;
    if (chat === undefined) throw new Error("agent chat is not configured");
    const post = await chat.sendMessage(input.threadId, {
      text: input.text,
      role: input.role,
    });
    await emitChatNetworkEvent({
      env: ctx.env,
      kind: "chat.message.sent",
      payload: {
        threadId: input.threadId,
        postId: post.id,
        role: input.role,
      },
      extra: post.id,
    });
    return { postId: post.id, threadId: input.threadId };
  },
});
