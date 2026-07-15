import type { AgentChatClient, AgentTurnParams, AgentUIMessage } from "@khoralabs/agent-net";
import type { UIMessage } from "ai";

import type { InboxEntry } from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

function postToUiMessage(post: {
  id: string;
  role: string;
  parts: UIMessage["parts"];
}): AgentUIMessage {
  return {
    id: post.id,
    role: post.role,
    parts: post.parts as AgentUIMessage["parts"],
  };
}

function formatInboxBlock(entries: InboxEntry[]): string {
  if (entries.length === 0) return "<inbox_entries></inbox_entries>";
  const lines = entries.map(
    (entry) => `<entry id="${entry.id}">${JSON.stringify(entry.event)}</entry>`,
  );
  return `<inbox_entries>\n${lines.join("\n")}\n</inbox_entries>`;
}

function formatThreadBlock(threadId: string, messages: AgentUIMessage[]): string {
  const lines = messages.map(
    (message) =>
      `<message role="${message.role}">${message.parts
        .filter((part) => part.type === "text")
        .map((part) => ("text" in part ? String(part.text) : ""))
        .join("")}</message>`,
  );
  return `<thread id="${threadId}">\n${lines.join("\n")}\n</thread>`;
}

export async function assembleTurnContext(input: {
  config: SwarmConfig;
  agent: AgentLoopState;
  agentChat: AgentChatClient;
  inboxEntries: InboxEntry[];
}): Promise<{
  params: AgentTurnParams;
  inboxEntryIds: string[];
}> {
  const { config, agent, agentChat, inboxEntries } = input;
  const inboxEntryIds = inboxEntries.map((entry) => entry.id);

  const selfPosts = await agentChat.listPosts(agent.selfThreadId, {
    limit: config.contextMessageLimit,
  });
  const selfMessages = selfPosts.items.map(postToUiMessage);

  const threadBlocks: string[] = [];
  const threads = await agentChat.listThreads();
  for (const thread of threads.items) {
    const posts = await agentChat.listPosts(thread.id, { limit: config.contextMessageLimit });
    threadBlocks.push(formatThreadBlock(thread.id, posts.items.map(postToUiMessage)));
  }

  const runId = crypto.randomUUID();
  const params: AgentTurnParams = {
    runId,
    agent: {
      id: agent.agentId,
      name: `Agent ${agent.role}`,
      actingFor: { type: "agent", id: agent.did },
    },
    model: config.model,
    context: {
      sessionId: config.sessionId,
      threadId: agent.selfThreadId,
      messages: selfMessages,
      instructions: [formatInboxBlock(inboxEntries), ...threadBlocks],
    },
    output: {
      chat: {
        threadId: agent.selfThreadId,
        streamDeltas: false,
      },
    },
  };

  return { params, inboxEntryIds };
}
