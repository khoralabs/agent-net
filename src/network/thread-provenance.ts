import type { Database } from "bun:sqlite";

import type { AgentChatClient } from "../chat.ts";
import { readPreviousPostVersion } from "../chat-signing.ts";
import type { ThreadHashSnapshot } from "./types.ts";

export async function collectThreadHashSnapshots(
  chatDb: Database,
  agentChat: AgentChatClient,
): Promise<ThreadHashSnapshot[]> {
  const threads = await agentChat.listThreads();
  const snapshots: ThreadHashSnapshot[] = [];
  for (const thread of threads.items) {
    const head = readPreviousPostVersion(chatDb, thread.id);
    const posts = await agentChat.listPosts(thread.id, { limit: 1 });
    const lastPost = posts.items.at(-1);
    snapshots.push({
      threadId: thread.id,
      headLineageHash: head?.lineageHash ?? "",
      lastPostContentHash: lastPost && "contentHash" in lastPost ? lastPost.contentHash : undefined,
    });
  }
  return snapshots;
}
