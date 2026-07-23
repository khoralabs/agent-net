import type {
  AppendPostInput,
  ChatSigner,
  JsonObject,
  Post,
  PostPage,
  PreparedAppendPost,
  ScopeRef,
  Thread,
  ThreadPage,
  ThreadTip,
} from "@khoralabs/chat";
import { isChatNotFoundError } from "@khoralabs/chat";
import {
  type ChatServiceClient,
  type ChatServiceClientOptions,
  createChatClient,
} from "@khoralabs/chat/http/client";
import { prepareAppendPost, signPreparedAppendPost } from "@khoralabs/chat/persistence";
import type { UIMessage } from "ai";

import { createHarnessChatCrypto, type ResolveHarnessChatSigner } from "./chat-crypto.ts";

export const HARNESS_CHAT_CHANNEL_ID = "harness-network";

export type { ChatServiceClient };

export type CreateAgentThreadInput = {
  id?: string;
  metadata?: JsonObject;
  /** Additional participants granted access when the thread is created. */
  participants?: Array<{ scope: ScopeRef; role?: string }>;
};

export type SendAgentMessageInput = {
  text: string;
  messageId?: string;
  role?: UIMessage["role"];
};

export type AgentChatClient = {
  readonly did: string;
  createThread(input?: CreateAgentThreadInput): Promise<Thread>;
  grantAccess(threadId: string, participant: ScopeRef, role?: string): Promise<void>;
  sendMessage(threadId: string, input: SendAgentMessageInput): Promise<Post>;
  listPosts(threadId: string, input?: { limit?: number; cursor?: string }): Promise<PostPage>;
  listThreads(input?: { limit?: number; cursor?: string }): Promise<ThreadPage>;
  getThread(threadId: string): Promise<Thread>;
  listParticipants(threadId: string): Promise<ScopeRef[]>;
};

export type CreateHarnessChatBackendOptions = {
  client: ChatServiceClient;
  resolveSigner: ResolveHarnessChatSigner;
};

export type SignedChatBackend = {
  readonly client: ChatServiceClient;
  readonly ready: Promise<void>;
  forAgent(did: string): AgentChatClient;
};

export type HarnessChat = {
  forAgent(did: string): AgentChatClient;
};

export type CreateRemoteHarnessChatOptions = {
  baseUrl: string;
  token: string;
  resolveSigner: ResolveHarnessChatSigner;
  fetchFn?: ChatServiceClientOptions["fetchFn"];
};

function agentScope(did: string): ScopeRef {
  return { type: "agent", id: did };
}

function textMessage(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

export function prepareAppendForSigningFromTip(
  tip: ThreadTip | null,
  input: AppendPostInput,
): PreparedAppendPost {
  return prepareAppendPost({
    ...input,
    previousPostVersionId: tip?.id ?? null,
    previousLineageHash: tip?.lineageHash ?? null,
  });
}

async function ensureHarnessChannel(client: ChatServiceClient): Promise<void> {
  try {
    await client.getChannel(HARNESS_CHAT_CHANNEL_ID);
  } catch (error) {
    if (!isChatNotFoundError(error)) throw error;
    await client.createChannel({
      id: HARNESS_CHAT_CHANNEL_ID,
      metadata: { title: "Network Harness", kind: "harness-network" },
    });
  }
}

export function createHarnessChatBackend(
  options: CreateHarnessChatBackendOptions,
): SignedChatBackend {
  const chatCrypto = createHarnessChatCrypto(options.resolveSigner);
  const ready = ensureHarnessChannel(options.client);

  return {
    client: options.client,
    ready,
    forAgent(did: string) {
      return createAgentChatClient(options.client, did, chatCrypto.signer, ready);
    },
  };
}

/** Connect harness chat to a remote (or fetchFn-backed) chat-http service. */
export function createRemoteHarnessChat(
  options: CreateRemoteHarnessChatOptions,
): SignedChatBackend {
  const client = createChatClient({
    baseUrl: options.baseUrl,
    token: options.token,
    fetchFn: options.fetchFn,
  });
  return createHarnessChatBackend({
    client,
    resolveSigner: options.resolveSigner,
  });
}

function createAgentChatClient(
  client: ChatServiceClient,
  did: string,
  chatSigner: ChatSigner,
  ready: Promise<void>,
): AgentChatClient {
  const scope = agentScope(did);

  async function whenReady<T>(fn: () => Promise<T>): Promise<T> {
    await ready;
    return fn();
  }

  async function requireParticipant(threadId: string): Promise<void> {
    const participants = await client.listThreadParticipants(threadId);
    const allowed = participants.some((p) => p.type === scope.type && p.id === scope.id);
    if (!allowed) {
      throw new Error(`agent ${did} does not have access to thread ${threadId}`);
    }
  }

  return {
    did,
    createThread(input = {}) {
      return whenReady(async () => {
        const thread = await client.createThread({
          id: input.id ?? crypto.randomUUID(),
          root: { type: "channel", channelId: HARNESS_CHAT_CHANNEL_ID },
          metadata: input.metadata,
        });

        await client.addThreadParticipant({
          threadId: thread.id,
          scope,
          role: "owner",
          actor: scope,
        });

        for (const participant of input.participants ?? []) {
          await client.addThreadParticipant({
            threadId: thread.id,
            scope: participant.scope,
            role: participant.role ?? "participant",
            actor: scope,
          });
        }

        return thread;
      });
    },
    grantAccess(threadId, participant, role = "participant") {
      return whenReady(async () => {
        await requireParticipant(threadId);
        await client.addThreadParticipant({
          threadId,
          scope: participant,
          role,
          actor: scope,
        });
      });
    },
    sendMessage(threadId, input) {
      return whenReady(async () => {
        await requireParticipant(threadId);

        const message = textMessage(
          input.messageId ?? crypto.randomUUID(),
          input.role ?? "user",
          input.text,
        );
        const appendInput = { threadId, author: scope, message };
        const tip = await client.getThreadTip(threadId);
        const prepared = prepareAppendForSigningFromTip(tip, appendInput);
        const signature = await signPreparedAppendPost(chatSigner, scope, prepared);

        const { post } = await client.appendPost({
          ...appendInput,
          message: prepared.message,
          versionId: prepared.versionId,
          createdAtMs: prepared.createdAtMs,
          signature,
        });
        return post;
      });
    },
    listPosts(threadId, input) {
      return whenReady(async () => {
        await requireParticipant(threadId);
        return client.listPosts({
          threadId,
          limit: input?.limit,
          cursor: input?.cursor,
        });
      });
    },
    listThreads(input) {
      return whenReady(() =>
        client.listThreads({
          channelId: HARNESS_CHAT_CHANNEL_ID,
          participant: scope,
          limit: input?.limit,
          cursor: input?.cursor,
        }),
      );
    },
    getThread(threadId) {
      return whenReady(() => client.getThread(threadId));
    },
    listParticipants(threadId) {
      return whenReady(() => client.listThreadParticipants(threadId));
    },
  };
}

export function createHarnessChat(options: CreateRemoteHarnessChatOptions): HarnessChat {
  const backend = createRemoteHarnessChat(options);
  return {
    forAgent(did: string) {
      return backend.forAgent(did);
    },
  };
}
