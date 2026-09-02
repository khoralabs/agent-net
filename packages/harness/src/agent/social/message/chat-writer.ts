import type {
  ApplyPostDeltaInput,
  ChatSigner,
  PostModelMetadata,
  PostUsage,
  ScopeRef,
  SignablePostVersion,
  StartStreamedPostInput,
} from "@khoralabs/chat";
import { canonicalSignedPostVersionPayload, signedPayloadBytes } from "@khoralabs/chat";
import type { ChatServiceClient } from "@khoralabs/chat/http/client";
import type { AgentUIMessage, AgentWorkflowParams } from "../../turn/types.ts";

export type AgentChatWriter = {
  postId: string;
  revision: number;
  start(message: AgentUIMessage): Promise<void>;
  apply(
    message: AgentUIMessage,
    metadata?: { model?: PostModelMetadata; usage?: PostUsage },
  ): Promise<void>;
  complete(): Promise<AgentUIMessage>;
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
  role: AgentUIMessage["role"];
  parts: AgentUIMessage["parts"];
  metadata?: AgentUIMessage["metadata"];
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
  const chat = params.output?.chat;
  if (chat === undefined) throw new Error("output.chat is required");
  const threadId = chat.threadId;
  const author = params.agent.actingFor as ScopeRef;

  let postId = chat.postId ?? params.runId;
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
        // Chat wire still types messages as AI SDK UIMessage; AgentUIMessage is structural.
        message: { ...message, id: postId } as StartStreamedPostInput["message"],
        idempotencyKey: `${params.runId}:start`,
      });
      postId = result.post.id;
      revision = result.revision;
    },
    async apply(message, metadata) {
      const result = await client.applyPostDelta({
        postId,
        message: { ...message, id: postId } as ApplyPostDeltaInput["message"],
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
      if (signer === undefined) {
        return post as AgentUIMessage;
      }

      const payload = canonicalSignedPostVersionPayload(signableFromCompletePost(post));
      const envelope = await signer.sign(signedPayloadBytes(payload), author);
      await client.setPostVersionSignature(post.versionId, envelope);
      return { ...post, signature: envelope } as AgentUIMessage;
    },
    async abort() {
      await client.abortStreamedPost({ postId });
    },
  };
}
