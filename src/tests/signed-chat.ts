import type { Database } from "bun:sqlite";
import os from "node:os";
import path from "node:path";
import type { ChatService } from "@khoralabs/chat-core";
import { generateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay-crypto";

import { createSignedChatService, type SignedChatBackend } from "../chat.ts";

export type SignedTestChat = {
  backend: SignedChatBackend;
  service: ChatService;
  agentDid: string;
  signer: RelaySigner;
  dataDir: string;
  threadId: string;
};

export async function createSignedTestChat(): Promise<SignedTestChat> {
  const dataDir = path.join(os.tmpdir(), `khora-signed-chat-${process.pid}-${crypto.randomUUID()}`);
  const signer = await generateIdentity();
  const signers = new Map([[signer.did, signer]]);
  const backend = createSignedChatService(dataDir, {
    resolveSigner: (did) => Promise.resolve(signers.get(did)),
  });
  const client = backend.forAgent(signer.did);
  const thread = await client.createThread({ metadata: { title: "test" } });

  return {
    backend,
    service: backend.service,
    agentDid: signer.did,
    signer,
    dataDir,
    threadId: thread.id,
  };
}

export function readPostSignatures(db: Database, threadId: string): string[] {
  const rows = db
    .prepare(
      "SELECT signature FROM chat_post_versions WHERE thread_id = ? ORDER BY created_at_ms ASC",
    )
    .all(threadId) as Array<{ signature: string | null }>;
  return rows.map((row) => row.signature).filter((value): value is string => value !== null);
}
