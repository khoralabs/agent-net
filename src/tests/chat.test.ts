import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import { generateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay-crypto";

import { createHarnessChat, type HarnessChat } from "../chat";

const dataDir = path.join(os.tmpdir(), `khora-chat-${process.pid}`);
const signers = new Map<string, RelaySigner>();
let chat: HarnessChat;

async function agentDid(): Promise<string> {
  const signer = await generateIdentity();
  signers.set(signer.did, signer);
  return signer.did;
}

function readPostSignatures(threadId: string): string[] {
  const db = new Database(path.join(dataDir, "chat", "chat.sqlite"));
  const rows = db
    .prepare(
      "SELECT signature FROM chat_post_versions WHERE thread_id = ? ORDER BY created_at_ms ASC",
    )
    .all(threadId) as Array<{ signature: string | null }>;
  return rows.map((row) => row.signature).filter((value): value is string => value !== null);
}

function firstTextPart(parts: ReadonlyArray<{ type: string; text?: string }>): string | undefined {
  const part = parts[0];
  return part?.type === "text" ? part.text : undefined;
}

beforeAll(() => {
  chat = createHarnessChat(dataDir, {
    resolveSigner: (did) => Promise.resolve(signers.get(did)),
  });
});

describe("harness chat", () => {
  test("agents create threads, send signed messages, and grant access", async () => {
    const aliceDid = await agentDid();
    const bobDid = await agentDid();
    const charlieDid = await agentDid();

    const alice = chat.forAgent(aliceDid);
    const bob = chat.forAgent(bobDid);
    const charlie = chat.forAgent(charlieDid);

    const thread = await alice.createThread({
      metadata: { title: "planning" },
      participants: [{ scope: { type: "agent", id: bobDid } }],
    });

    await alice.sendMessage(thread.id, { text: "Let's coordinate." });
    await bob.sendMessage(thread.id, { text: "Sounds good." });

    await expect(charlie.sendMessage(thread.id, { text: "Can I join?" })).rejects.toThrow(
      "does not have access",
    );

    await alice.grantAccess(thread.id, { type: "agent", id: charlieDid });
    await charlie.sendMessage(thread.id, { text: "Thanks for the invite." });

    const posts = await charlie.listPosts(thread.id);
    expect(posts.items).toHaveLength(3);
    expect(posts.items.map((post) => firstTextPart(post.parts))).toEqual([
      "Let's coordinate.",
      "Sounds good.",
      "Thanks for the invite.",
    ]);

    const signatures = readPostSignatures(thread.id);
    expect(signatures).toHaveLength(3);
    for (const signatureJson of signatures) {
      const envelope = JSON.parse(signatureJson) as { algorithm: string; signer: { id: string } };
      expect(envelope.algorithm).toBe("ed25519");
      expect(signers.has(envelope.signer.id)).toBe(true);
    }

    const participants = await alice.listParticipants(thread.id);
    expect(participants).toEqual(
      expect.arrayContaining([
        { type: "agent", id: aliceDid },
        { type: "agent", id: bobDid },
        { type: "agent", id: charlieDid },
      ]),
    );

    const aliceThreads = await alice.listThreads();
    expect(aliceThreads.items.map((item) => item.id)).toContain(thread.id);

    const charlieThreads = await charlie.listThreads();
    expect(charlieThreads.items.map((item) => item.id)).toContain(thread.id);
  });

  test("agents without signing keys cannot send messages", async () => {
    const ownerDid = await agentDid();
    const owner = chat.forAgent(ownerDid);
    const unsigned = chat.forAgent("did:key:unsigned-agent");

    const thread = await owner.createThread();
    await owner.grantAccess(thread.id, { type: "agent", id: "did:key:unsigned-agent" });
    await expect(unsigned.sendMessage(thread.id, { text: "hello" })).rejects.toThrow(
      "no signing key",
    );
  });

  test("later grants allow new participants to read thread results", async () => {
    const ownerDid = await agentDid();
    const observerDid = await agentDid();

    const owner = chat.forAgent(ownerDid);
    const observer = chat.forAgent(observerDid);

    const thread = await owner.createThread();
    await owner.sendMessage(thread.id, { text: "result: 42", role: "assistant" });

    expect((await observer.listThreads()).items).toHaveLength(0);

    await owner.grantAccess(thread.id, { type: "agent", id: observerDid }, "reader");

    const threads = await observer.listThreads();
    expect(threads.items.map((item) => item.id)).toContain(thread.id);

    const posts = await observer.listPosts(thread.id);
    expect(posts.items.some((post) => firstTextPart(post.parts) === "result: 42")).toBe(true);
  });
});
