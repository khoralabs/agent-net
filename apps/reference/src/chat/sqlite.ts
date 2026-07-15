import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ChatPersistence } from "@khoralabs/chat-core";
import {
  createSqliteChatPersistence,
  ensureChatSqliteSchema,
} from "@khoralabs/chat-persistence-sqlite";

/** Durable sqlite chat ledger under `{dataDir}/chat/chat.sqlite`. */
export function createReferenceChatPersistence(dataDir: string): ChatPersistence {
  const chatDir = path.join(dataDir, "chat");
  mkdirSync(chatDir, { recursive: true });
  const db = new Database(path.join(chatDir, "chat.sqlite"));
  ensureChatSqliteSchema(db);
  return createSqliteChatPersistence(db);
}
