import path from "node:path";
import { loadOrCreateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay/crypto";
import { requireChatBaseUrl, requireChatToken } from "../../../lib/chat-base-url.ts";
import {
  loadHarnessIdentity,
  resolveIdentitySecretFromEnv,
} from "../../../pool/identity-wrap-key.ts";
import { AgentStore } from "../../../pool/index.ts";
import { resolveAgentsDataDir } from "../tools/_helpers/khora-client-factory.ts";
import {
  type AgentChatClient,
  type ChatServiceClient,
  type CreateAgentThreadInput,
  type CreateRemoteHarnessChatOptions,
  createRemoteHarnessChat,
  type SignedChatBackend,
} from "./chat.ts";
import { createHarnessChatCrypto } from "./chat-crypto.ts";

let backend: SignedChatBackend | undefined;
let resolveSigner: CreateRemoteHarnessChatOptions["resolveSigner"] | undefined;
let chatChannelId: string | undefined;
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
  channelId?: string;
  resolveSigner?: CreateRemoteHarnessChatOptions["resolveSigner"];
  fetchFn?: CreateRemoteHarnessChatOptions["fetchFn"];
};

/** Install remote chat-http client for the agent process singleton. */
export function installAgentChat(options: InstallAgentChatOptions = {}): SignedChatBackend {
  const baseUrl = requireChatBaseUrl(options.baseUrl);
  const token = requireChatToken(options.token);
  resolveSigner = options.resolveSigner ?? resolveAgentChatSigner;
  chatChannelId = options.channelId;
  backend = createRemoteHarnessChat({
    baseUrl,
    token,
    resolveSigner,
    ...(options.channelId !== undefined ? { channelId: options.channelId } : {}),
    ...(options.fetchFn !== undefined ? { fetchFn: options.fetchFn } : {}),
  });
  return backend;
}

function getSignedChatBackend(): SignedChatBackend {
  if (backend !== undefined) return backend;
  // Workflow step isolates load steps.mjs without main.ts — install from env.
  return installAgentChat({
    resolveSigner: resolveSigner ?? resolveAgentChatSigner,
    ...(chatChannelId !== undefined ? { channelId: chatChannelId } : {}),
  });
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

/** Chat client for a specific agent DID (workflow actingFor). */
export function getAgentChatClientForDid(did: string): AgentChatClient {
  const trimmed = did.trim();
  if (trimmed.length === 0) {
    throw new Error("agentDid is required");
  }
  return getSignedChatBackend().forAgent(trimmed);
}

/**
 * Idempotently ensure a thread exists for the given chat client.
 * Naming / topology is caller-owned — pass an explicit `id`.
 */
export async function ensureThread(
  chat: AgentChatClient,
  input: CreateAgentThreadInput & { id: string },
): Promise<string> {
  const threadId = input.id.trim();
  if (threadId.length === 0) {
    throw new Error("ensureThread: id is required");
  }
  try {
    await chat.getThread(threadId);
  } catch {
    await chat.createThread({
      id: threadId,
      metadata: input.metadata,
      participants: input.participants,
    });
  }
  return threadId;
}
