import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay-crypto";

import type { HarnessChat, SignedChatBackend } from "../chat";
import {
  createTestHarnessChatBackend,
  startTestChatHttp,
  type TestChatHttpHandle,
} from "./test-chat-http.ts";

const signers = new Map<string, RelaySigner>();
let chatHttp: TestChatHttpHandle;
let backend: SignedChatBackend;
let chat: HarnessChat;

async function agentDid(): Promise<string> {
  const signer = await generateIdentity();
  signers.set(signer.did, signer);
  return signer.did;
}

async function readPostSignatures(
  threadId: string,
): Promise<Array<{ algorithm: string; signer: { id: string } }>> {
  const posts = await backend.client.listPosts({ threadId });
  return posts.items.flatMap((post) => {
    if (post.status !== "complete" || post.signature === undefined) return [];
    return [post.signature];
  });
}

function firstTextPart(parts: ReadonlyArray<{ type: string; text?: string }>): string | undefined {
  const part = parts[0];
  return part?.type === "text" ? part.text : undefined;
}

beforeAll(() => {
  chatHttp = startTestChatHttp();
  backend = createTestHarnessChatBackend({
    chatHttp,
    resolveSigner: (did) => Promise.resolve(signers.get(did)),
  });
  chat = {
    forAgent(did: string) {
      return backend.forAgent(did);
    },
  };
});

afterAll(() => {
  chatHttp.stop();
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

    const signatures = await readPostSignatures(thread.id);
    expect(signatures).toHaveLength(3);
    for (const envelope of signatures) {
      expect(envelope.algorithm).toBe("ed25519");
      expect(signers.has(envelope.signer.id)).toBe(true);
    }
  });

  test("listThreads returns only threads the agent participates in", async () => {
    const aliceDid = await agentDid();
    const bobDid = await agentDid();
    const alice = chat.forAgent(aliceDid);
    const bob = chat.forAgent(bobDid);

    const aliceThread = await alice.createThread({ metadata: { title: "alice-only" } });
    await bob.createThread({ metadata: { title: "bob-only" } });

    const aliceThreads = await alice.listThreads();
    expect(aliceThreads.items.some((t) => t.id === aliceThread.id)).toBe(true);
    expect(aliceThreads.items.every((t) => t.id !== "missing")).toBe(true);
  });
});
