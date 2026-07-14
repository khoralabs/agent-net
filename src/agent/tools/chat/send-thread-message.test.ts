import { expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@khoralabs/agent-capabilities";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { AgentChatClient } from "../../../chat.ts";
import { harnessToolkit } from "../_toolkit.ts";
import type { HarnessToolkitEnv } from "../types.ts";

function createEnv(agentChat: AgentChatClient): HarnessToolkitEnv {
  return {
    skills: [],
    activatedSkillNames: new Set(),
    embeddingCache: new Map(),
    agentChat,
    sessionId: "session-1",
  };
}

function mockChat(): AgentChatClient {
  return {
    did: "did:key:agent",
    createThread: async () => ({ id: "thread-1" }) as never,
    grantAccess: async () => undefined,
    sendMessage: async (threadId, input) =>
      ({
        id: "post-1",
        role: input.role ?? "user",
        parts: [{ type: "text", text: input.text }],
        threadId,
      }) as never,
    listPosts: async () => ({ items: [], nextCursor: null }),
    listThreads: async () => ({ items: [], nextCursor: null }),
    getThread: async (threadId) => ({ id: threadId }) as never,
    listParticipants: async () => [],
  };
}

test("sendThreadMessage posts to peer thread with mock chat client", async () => {
  const env = createEnv(mockChat());
  const { tools } = await evaluateComposable(harnessToolkit, { env });
  const spec = (tools as { sendThreadMessage?: ToolSpec }).sendThreadMessage;
  if (spec === undefined) throw new Error("sendThreadMessage tool not available");

  const handler = spec.handler.bind(spec) as (
    ctx: ToolRuntimeContext<HarnessToolkitEnv>,
    input: { threadId: string; text: string },
  ) => Promise<{ postId: string; threadId: string }>;

  const result = await handler(
    { env, agentId: "agent", agentName: "Agent" },
    { threadId: "thread-peer", text: "hello peers" },
  );

  expect(result.postId).toBe("post-1");
  expect(result.threadId).toBe("thread-peer");
});
