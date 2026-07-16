import type {
  ChatSigner,
  PostModelMetadata,
  PostUsage,
  ScopeRef,
  SignablePostVersion,
} from "@khoralabs/chat-core";
import { canonicalSignedPostVersionPayload, signedPayloadBytes } from "@khoralabs/chat-core";
import type { ChatServiceClient } from "@khoralabs/chat-http/client";
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

export type CreateAgentChatWriterOptions = {
  client: ChatServiceClient;
  params: AgentWorkflowParams;
  /** When set, stream-complete versions are signed client-side. */
  signer?: ChatSigner;
};

function signableFromCompletePost(post: {
  id: string;
  versionId: string;
  threadId: string;
  author: ScopeRef;
  role: UIMessage["role"];
  parts: UIMessage["parts"];
  metadata?: UIMessage["metadata"];
  mentions?: SignablePostVersion["mentions"];
  model?: PostModelMetadata;
  usage?: PostUsage;
  previousVersionId?: string | null;
  previousPostVersionId?: string | null;
  contentHash: string;
  lineageHash: string;
}): SignablePostVersion {
  return {
    postId: post.id,
    versionId: post.versionId,
    threadId: post.threadId,
    author: post.author,
    role: post.role,
    parts: post.parts,
    metadata: post.metadata,
    mentions: post.mentions,
    model: post.model,
    usage: post.usage,
    parentVersionId: post.previousVersionId ?? null,
    previousPostVersionId: post.previousPostVersionId ?? null,
    contentHash: post.contentHash,
    lineageHash: post.lineageHash,
  };
}

export function createAgentChatWriter(options: CreateAgentChatWriterOptions): AgentChatWriter {
  const { client, params, signer } = options;
  const threadId = params.output.chat.threadId;
  const author = params.agent.actingFor as ScopeRef;

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
      const result = await client.startStreamedPost({
        threadId,
        author,
        message: { ...message, id: postId },
        idempotencyKey: `${params.runId}:start`,
      });
      postId = result.post.id;
      revision = result.revision;
    },
    async apply(message, metadata) {
      const result = await client.applyPostDelta({
        postId,
        message: { ...message, id: postId },
        model: metadata?.model,
        usage: metadata?.usage,
        expectedRevision: revision,
      });
      revision = result.revision;
    },
    async complete() {
      const { post } = await client.completeStreamedPost({
        postId,
        expectedRevision: revision,
        idempotencyKey: `${params.runId}:complete`,
      });
      if (post.status !== "complete") {
        throw new Error(`expected complete post, got ${post.status}`);
      }
      if (signer === undefined) return post;

      const payload = canonicalSignedPostVersionPayload(signableFromCompletePost(post));
      const envelope = await signer.sign(signedPayloadBytes(payload), author);
      await client.setPostVersionSignature(post.versionId, envelope);
      return { ...post, signature: envelope };
    },
    async abort() {
      await client.abortStreamedPost({ postId });
    },
  };
}
