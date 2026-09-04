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
import { ChatHttpClientError } from "@khoralabs/chat/http";
import {
  type ChatServiceClient,
  type ChatServiceClientOptions,
  createChatClient,
} from "@khoralabs/chat/http/client";
import { prepareAppendPost, signPreparedAppendPost } from "@khoralabs/chat/persistence";
import type { AgentUIMessage } from "../../turn/types.ts";

import { createHarnessChatCrypto, type ResolveHarnessChatSigner } from "./chat-crypto.ts";

/** Soft default channel id when the host does not pass `channelId`. */
export const HARNESS_CHAT_CHANNEL_ID = "harness-network";

export type HarnessChatFetch = ChatServiceClientOptions["fetchFn"];

let installedChatFetch: HarnessChatFetch | undefined;

export function installHarnessChatFetch(fetchFn: HarnessChatFetch | undefined): void {
  installedChatFetch = fetchFn;
}

export function harnessChatFetch(): HarnessChatFetch | undefined {
  return installedChatFetch;
}

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
  role?: AgentUIMessage["role"];
  /** Host-defined message metadata (e.g. documents, sources). */
  metadata?: JsonObject;
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
  /** Channel id for ensureChannel / createThread root / listThreads. */
  channelId?: string;
};

export type SignedChatBackend = {
  readonly client: ChatServiceClient;
  readonly channelId: string;
  readonly ready: Promise<void>;
  forAgent(did: string): AgentChatClient;
  /** Chat client that authors as an arbitrary scope (agent, user, …). */
  forScope(scope: ScopeRef): AgentChatClient;
};

export type HarnessChat = {
  forAgent(did: string): AgentChatClient;
  forScope(scope: ScopeRef): AgentChatClient;
};

export type CreateRemoteHarnessChatOptions = {
  baseUrl: string;
  token: string;
  resolveSigner: ResolveHarnessChatSigner;
  fetchFn?: ChatServiceClientOptions["fetchFn"];
  channelId?: string;
};

function agentScope(did: string): ScopeRef {
  return { type: "agent", id: did };
}

function textMessage(
  id: string,
  role: AgentUIMessage["role"],
  text: string,
  metadata?: JsonObject,
): AgentUIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    ...(metadata !== undefined ? { metadata } : {}),
  };
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

async function ensureHarnessChannel(client: ChatServiceClient, channelId: string): Promise<void> {
  try {
    await client.getChannel(channelId);
  } catch (error) {
    if (isChatNotFoundError(error)) {
      await client.createChannel({
        id: channelId,
        metadata: { title: "Network Harness", kind: "harness-network" },
      });
      return;
    }
    if (error instanceof ChatHttpClientError && error.code === "not_found") {
      await client.createChannel({
        id: channelId,
        metadata: { title: "Network Harness", kind: "harness-network" },
      });
      return;
    }
    throw error;
  }
}

export function createHarnessChatBackend(
  options: CreateHarnessChatBackendOptions,
): SignedChatBackend {
  const channelId = options.channelId?.trim() || HARNESS_CHAT_CHANNEL_ID;
  const chatCrypto = createHarnessChatCrypto(options.resolveSigner);
  const ready = ensureHarnessChannel(options.client, channelId);

  return {
    client: options.client,
    channelId,
    ready,
    forAgent(did: string) {
      return createScopedChatClient(
        options.client,
        agentScope(did),
        chatCrypto.signer,
        ready,
        channelId,
      );
    },
    forScope(scope: ScopeRef) {
      return createScopedChatClient(options.client, scope, chatCrypto.signer, ready, channelId);
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
    fetchFn: options.fetchFn ?? harnessChatFetch(),
  });
  return createHarnessChatBackend({
    client,
    resolveSigner: options.resolveSigner,
    channelId: options.channelId,
  });
}

function createScopedChatClient(
  client: ChatServiceClient,
  scope: ScopeRef,
  chatSigner: ChatSigner,
  ready: Promise<void>,
  channelId: string,
): AgentChatClient {
  async function whenReady<T>(fn: () => Promise<T>): Promise<T> {
    await ready;
    return fn();
  }

  async function requireParticipant(threadId: string): Promise<void> {
    const participants = await client.listThreadParticipants(threadId);
    const allowed = participants.some((p) => p.type === scope.type && p.id === scope.id);
    if (!allowed) {
      throw new Error(`${scope.type} ${scope.id} does not have access to thread ${threadId}`);
    }
  }

  return {
    did: scope.id,
    createThread(input = {}) {
      return whenReady(async () => {
        const thread = await client.createThread({
          id: input.id ?? crypto.randomUUID(),
          root: { type: "channel", channelId },
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
          input.metadata,
        );
        // Chat wire still types messages as AI SDK UIMessage; AgentUIMessage is structural.
        const appendInput: AppendPostInput = {
          threadId,
          author: scope,
          message: message as AppendPostInput["message"],
        };
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
          channelId,
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
