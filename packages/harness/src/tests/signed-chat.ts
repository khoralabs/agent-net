import type { ChatSigner, SignedEnvelope } from "@khoralabs/chat-core";
import { generateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay-crypto";

import type { ChatServiceClient, SignedChatBackend } from "../chat.ts";
import { createHarnessChatCrypto } from "../chat-crypto.ts";
import {
  createTestHarnessChatBackend,
  startTestChatHttp,
  type TestChatHttpHandle,
} from "./test-chat-http.ts";

export type SignedTestChat = {
  chatHttp: TestChatHttpHandle;
  backend: SignedChatBackend;
  client: ChatServiceClient;
  chatSigner: ChatSigner;
  agentDid: string;
  signer: RelaySigner;
  threadId: string;
  stop(): void;
};

export async function createSignedTestChat(): Promise<SignedTestChat> {
  const signer = await generateIdentity();
  const signers = new Map([[signer.did, signer]]);
  const resolveSigner = (did: string) => Promise.resolve(signers.get(did));
  const chatHttp = startTestChatHttp();
  const backend = createTestHarnessChatBackend({
    chatHttp,
    resolveSigner,
  });
  const agentClient = backend.forAgent(signer.did);
  const thread = await agentClient.createThread({ metadata: { title: "test" } });

  return {
    chatHttp,
    backend,
    client: backend.client,
    chatSigner: createHarnessChatCrypto(resolveSigner).signer,
    agentDid: signer.did,
    signer,
    threadId: thread.id,
    stop() {
      chatHttp.stop();
    },
  };
}

export async function readPostSignatures(
  client: ChatServiceClient,
  threadId: string,
): Promise<SignedEnvelope[]> {
  const posts = await client.listPosts({ threadId });
  return posts.items.flatMap((post) => {
    if (post.status !== "complete" || post.signature === undefined) return [];
    return [post.signature];
  });
}
