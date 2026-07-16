import path from "node:path";
import { loadOrCreateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay-crypto";
import { AgentStore } from "../agents";

import {
  type AgentChatClient,
  type ChatServiceClient,
  type CreateRemoteHarnessChatOptions,
  createRemoteHarnessChat,
  HARNESS_CHAT_CHANNEL_ID,
  type SignedChatBackend,
} from "../chat.ts";
import { createHarnessChatCrypto } from "../chat-crypto.ts";
import { requireChatBaseUrl, requireChatToken } from "../lib/chat-base-url.ts";
import { loadHarnessIdentity, resolveIdentitySecretFromEnv } from "../lib/identity-wrap-key.ts";
import { resolveAgentsDataDir } from "./tools/khora/_helpers/khora-client-factory.ts";

export const HARNESS_AGENT_DEV_THREAD_ID = "harness-agent-self";

let backend: SignedChatBackend | undefined;
let resolveSigner: CreateRemoteHarnessChatOptions["resolveSigner"] | undefined;
let devAgentDid: string | undefined;

function identitySecret() {
  return resolveIdentitySecretFromEnv();
}

function devAgentKeyPath(): string {
  return path.join(resolveAgentsDataDir(), "dev-agent", "identity.json");
}

export async function ensureDevAgentIdentity(): Promise<RelaySigner> {
  const secret = identitySecret();
  const signer = await loadOrCreateIdentity(
    devAgentKeyPath(),
    secret !== undefined ? { secret } : {},
  );
  devAgentDid = signer.did;
  return signer;
}

export async function getDevAgentDid(): Promise<string> {
  return (await ensureDevAgentIdentity()).did;
}

/** Default DID key resolution for the agent process (dev agent + AgentStore). */
export async function resolveAgentChatSigner(did: string): Promise<RelaySigner | undefined> {
  const secret = identitySecret();
  const devDid = devAgentDid ?? (await ensureDevAgentIdentity()).did;
  if (did === devDid) {
    return loadOrCreateIdentity(devAgentKeyPath(), secret !== undefined ? { secret } : {});
  }
  return loadHarnessIdentity(AgentStore.keyPath(resolveAgentsDataDir(), did), secret);
}

export type InstallAgentChatOptions = {
  baseUrl?: string;
  token?: string;
  resolveSigner?: CreateRemoteHarnessChatOptions["resolveSigner"];
};

/** Install remote chat-http client for the agent process singleton. */
export function installAgentChat(options: InstallAgentChatOptions = {}): SignedChatBackend {
  const baseUrl = requireChatBaseUrl(options.baseUrl);
  const token = requireChatToken(options.token);
  resolveSigner = options.resolveSigner ?? resolveAgentChatSigner;
  backend = createRemoteHarnessChat({
    baseUrl,
    token,
    resolveSigner,
  });
  return backend;
}

function getSignedChatBackend(): SignedChatBackend {
  if (backend !== undefined) return backend;
  throw new Error("agent chat is not configured; call installAgentChat first");
}

export function getAgentChatService(): ChatServiceClient {
  return getSignedChatBackend().client;
}

export function getAgentChatSigner() {
  const resolve = resolveSigner ?? resolveAgentChatSigner;
  return createHarnessChatCrypto(resolve).signer;
}

export async function getAgentChatClient(): Promise<AgentChatClient> {
  const did = await getDevAgentDid();
  return getSignedChatBackend().forAgent(did);
}

export async function ensureAgentChatThread(): Promise<{ channelId: string; threadId: string }> {
  const client = await getAgentChatClient();
  try {
    await client.getThread(HARNESS_AGENT_DEV_THREAD_ID);
  } catch {
    await client.createThread({
      id: HARNESS_AGENT_DEV_THREAD_ID,
      metadata: { title: "Agent self-thread", kind: "agent-monologue" },
    });
  }
  return { channelId: HARNESS_CHAT_CHANNEL_ID, threadId: HARNESS_AGENT_DEV_THREAD_ID };
}
