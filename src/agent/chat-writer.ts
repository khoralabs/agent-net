import type { ChatService, PostModelMetadata, PostUsage } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";

import type { AgentWorkflowParams } from "./types.ts";

export type AgentChatWriter = {
  postId: string;
  revision: number;
  start(message: UIMessage): Promise<void>;
  apply(
    message: UIMessage,
    metadata?: { model?: PostModelMetadata; usage?: PostUsage },
  ): Promise<void>;
  complete(): Promise<UIMessage>;
  abort(): Promise<void>;
};

export function createAgentChatWriter(
  service: ChatService,
  params: AgentWorkflowParams,
): AgentChatWriter {
  const threadId = params.output.chat.threadId;

  let postId = params.output.chat.postId ?? params.runId;
  let revision = 0;

  return {
    get postId() {
      return postId;
    },
    get revision() {
      return revision;
    },
    async start(message) {
      const result = await service.startStreamedPost({
        threadId,
        author: params.agent.actingFor,
        message: { ...message, id: postId },
        idempotencyKey: `${params.runId}:start`,
      });
      postId = result.post.id;
      revision = result.revision;
    },
    async apply(message, metadata) {
      const result = await service.applyPostDelta({
        postId,
        message: { ...message, id: postId },
        model: metadata?.model,
        usage: metadata?.usage,
        expectedRevision: revision,
      });
      revision = result.revision;
    },
    async complete() {
      const { post } = await service.completeStreamedPost({
        postId,
        expectedRevision: revision,
        idempotencyKey: `${params.runId}:complete`,
      });
      return post;
    },
    async abort() {
      await service.abortStreamedPost({ postId });
    },
  };
}
