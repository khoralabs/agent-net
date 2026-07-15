import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  ChatService,
  JsonObject,
  Post,
  PostPage,
  ScopeRef,
  Thread,
  ThreadPage,
} from "@khoralabs/chat-core";
import { ChatNotFoundError, createChatService } from "@khoralabs/chat-core";
import {
  createSqliteChatPersistence,
  ensureChatSqliteSchema,
} from "@khoralabs/chat-persistence-sqlite";
import type { RelaySigner } from "@khoralabs/relay-crypto";
import type { UIMessage } from "ai";
import {
  createSignedChatPersistence,
  prepareSignedAppendPost,
  signPreparedAppendPost,
} from "./chat-signing";

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
  resolveSigner: (did: string) => Promise<RelaySigner | undefined>;
};

export type SignedChatBackend = {
  readonly service: ChatService;
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
  const persistence = createSignedChatPersistence(
    createSqliteChatPersistence(db),
    db,
    options.resolveSigner,
  );
  const service = createChatService(persistence);
  const ready = ensureHarnessChannel(service);

  return {
    service,
    db,
    ready,
    forAgent(did: string) {
      return createAgentChatClient(service, db, did, options.resolveSigner, ready);
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

function listAccessibleThreadIds(db: Database, scope: ScopeRef): string[] {
  const rows = db
    .prepare(
      `SELECT p.thread_id
       FROM chat_thread_participants p
       INNER JOIN chat_threads t ON t.id = p.thread_id
       WHERE p.scope_type = ? AND p.scope_id = ?
         AND t.root_type = 'channel' AND t.root_id = ?
       ORDER BY t.created_at_ms ASC`,
    )
    .all(scope.type, scope.id, HARNESS_CHAT_CHANNEL_ID) as Array<{ thread_id: string }>;
  return rows.map((row) => row.thread_id);
}

function createAgentChatClient(
  service: ChatService,
  db: Database,
  did: string,
  resolveSigner: (did: string) => Promise<RelaySigner | undefined>,
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
        const signer = await resolveSigner(did);
        if (!signer) {
          throw new Error(`no signing key for agent ${did}`);
        }

        const message = textMessage(
          input.messageId ?? crypto.randomUUID(),
          input.role ?? "user",
          input.text,
        );
        const appendInput = { threadId, author: scope, message };
        const prepared = prepareSignedAppendPost(db, appendInput);
        const signature = await signPreparedAppendPost(signer, scope, prepared);

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
      return whenReady(async () => {
        const limit = input?.limit ?? 50;
        const start = input?.cursor ? Number.parseInt(input.cursor, 10) : 0;
        const threadIds = listAccessibleThreadIds(db, scope);
        const slice = threadIds.slice(start, start + limit);
        const items = await Promise.all(slice.map((id) => service.getThread(id)));
        return {
          items,
          nextCursor: start + limit < threadIds.length ? String(start + limit) : null,
        };
      });
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
