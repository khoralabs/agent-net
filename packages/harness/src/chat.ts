import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ChatPersistence,
  ChatService,
  ChatSigner,
  JsonObject,
  Post,
  PostPage,
  ScopeRef,
  Thread,
  ThreadPage,
} from "@khoralabs/chat-core";
import { ChatNotFoundError, createChatService } from "@khoralabs/chat-core";
import {
  prepareAppendForSigning,
  signPreparedAppendPost,
  withSignedChatPersistence,
} from "@khoralabs/chat-persistence";
import {
  createSqliteChatPersistence,
  ensureChatSqliteSchema,
} from "@khoralabs/chat-persistence-sqlite";
import type { UIMessage } from "ai";

import {
  createHarnessChatCrypto,
  type ResolveHarnessChatSigner,
} from "./chat-crypto.ts";

export const HARNESS_CHAT_CHANNEL_ID = "harness-network";

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

export type HarnessChatOptions = {
  resolveSigner: ResolveHarnessChatSigner;
};

export type SignedChatBackend = {
  readonly service: ChatService;
  readonly persistence: ChatPersistence;
  readonly db: Database;
  readonly ready: Promise<void>;
  forAgent(did: string): AgentChatClient;
};

export type HarnessChat = {
  forAgent(did: string): AgentChatClient;
};

function agentScope(did: string): ScopeRef {
  return { type: "agent", id: did };
}

function textMessage(id: string, role: UIMessage["role"], text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

function openHarnessChatDatabase(dataDir: string): Database {
  const chatDir = path.join(dataDir, "chat");
  mkdirSync(chatDir, { recursive: true });
  const db = new Database(path.join(chatDir, "chat.sqlite"));
  ensureChatSqliteSchema(db);
  return db;
}

export function createSignedChatService(
  dataDir: string,
  options: HarnessChatOptions,
): SignedChatBackend {
  const db = openHarnessChatDatabase(dataDir);
  const chatCrypto = createHarnessChatCrypto(options.resolveSigner);
  const persistence = withSignedChatPersistence(createSqliteChatPersistence(db), chatCrypto);
  const service = createChatService(persistence);
  const ready = ensureHarnessChannel(service);

  return {
    service,
    persistence,
    db,
    ready,
    forAgent(did: string) {
      return createAgentChatClient(service, persistence, did, chatCrypto.signer, ready);
    },
  };
}

async function ensureHarnessChannel(service: ChatService): Promise<void> {
  try {
    await service.getChannel(HARNESS_CHAT_CHANNEL_ID);
  } catch (error) {
    if (!(error instanceof ChatNotFoundError)) throw error;
    await service.createChannel({
      id: HARNESS_CHAT_CHANNEL_ID,
      metadata: { title: "Network Harness", kind: "harness-network" },
    });
  }
}

function createAgentChatClient(
  service: ChatService,
  persistence: ChatPersistence,
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
    const participants = await service.listThreadParticipants(threadId);
    const allowed = participants.some((p) => p.type === scope.type && p.id === scope.id);
    if (!allowed) {
      throw new Error(`agent ${did} does not have access to thread ${threadId}`);
    }
  }

  return {
    did,
    createThread(input = {}) {
      return whenReady(async () => {
        const thread = await service.createThread({
          id: input.id,
          root: { type: "channel", channelId: HARNESS_CHAT_CHANNEL_ID },
          metadata: input.metadata,
        });

        await service.addThreadParticipant({
          threadId: thread.id,
          scope,
          role: "owner",
          actor: scope,
        });

        for (const participant of input.participants ?? []) {
          await service.addThreadParticipant({
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
        await service.addThreadParticipant({
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
        const prepared = await prepareAppendForSigning(persistence, appendInput);
        const signature = await signPreparedAppendPost(chatSigner, scope, prepared);

        const { post } = await service.appendPost({
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
        return service.listPosts({
          threadId,
          limit: input?.limit,
          cursor: input?.cursor,
        });
      });
    },
    listThreads(input) {
      return whenReady(() =>
        service.listThreads({
          channelId: HARNESS_CHAT_CHANNEL_ID,
          participant: scope,
          limit: input?.limit,
          cursor: input?.cursor,
        }),
      );
    },
    getThread(threadId) {
      return whenReady(() => service.getThread(threadId));
    },
    listParticipants(threadId) {
      return whenReady(() => service.listThreadParticipants(threadId));
    },
  };
}

export function createHarnessChat(dataDir: string, options: HarnessChatOptions): HarnessChat {
  const backend = createSignedChatService(dataDir, options);
  return {
    forAgent(did: string) {
      return backend.forAgent(did);
    },
  };
}
