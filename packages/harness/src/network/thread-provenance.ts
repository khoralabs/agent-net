import type { ChatService } from "@khoralabs/chat-core";

import type { AgentChatClient } from "../chat.ts";
import type { ThreadHashSnapshot } from "./types.ts";

export async function collectThreadHashSnapshots(
  chatService: ChatService,
  agentChat: AgentChatClient,
): Promise<ThreadHashSnapshot[]> {
  const threads = await agentChat.listThreads();
  const snapshots: ThreadHashSnapshot[] = [];
  for (const thread of threads.items) {
    const tip = await chatService.getThreadTip(thread.id);
    const posts = await agentChat.listPosts(thread.id, { limit: 1 });
    const lastPost = posts.items.at(-1);
    snapshots.push({
      threadId: thread.id,
      headLineageHash: tip?.lineageHash ?? "",
      lastPostContentHash: lastPost && "contentHash" in lastPost ? lastPost.contentHash : undefined,
    });
  }
  return snapshots;
}
