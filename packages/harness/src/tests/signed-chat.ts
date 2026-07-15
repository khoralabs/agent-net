import { createMemoryChatPersistence } from "@khoralabs/chat-persistence";
import type { ChatService, SignedEnvelope } from "@khoralabs/chat-core";
import { generateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay-crypto";

import { createSignedChatService, type SignedChatBackend } from "../chat.ts";

export type SignedTestChat = {
  backend: SignedChatBackend;
  service: ChatService;
  agentDid: string;
  signer: RelaySigner;
  threadId: string;
};

export async function createSignedTestChat(): Promise<SignedTestChat> {
  const signer = await generateIdentity();
  const signers = new Map([[signer.did, signer]]);
  const backend = createSignedChatService({
    persistence: createMemoryChatPersistence(),
    resolveSigner: (did) => Promise.resolve(signers.get(did)),
  });
  const client = backend.forAgent(signer.did);
  const thread = await client.createThread({ metadata: { title: "test" } });

  return {
    backend,
    service: backend.service,
    agentDid: signer.did,
    signer,
    threadId: thread.id,
  };
}

export async function readPostSignatures(
  service: ChatService,
  threadId: string,
): Promise<SignedEnvelope[]> {
  const posts = await service.listPosts({ threadId });
  return posts.items.flatMap((post) => {
    if (post.status !== "complete" || post.signature === undefined) return [];
    return [post.signature];
  });
}
