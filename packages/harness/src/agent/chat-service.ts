import path from "node:path";
import type { ChatService } from "@khoralabs/chat-core";
import { loadIdentity, loadOrCreateIdentity } from "@khoralabs/did-key-identity";
import type { RelaySigner } from "@khoralabs/relay-crypto";
import { AgentStore } from "../agents";

import {
  type AgentChatClient,
  createSignedChatService,
  HARNESS_CHAT_CHANNEL_ID,
  type SignedChatBackend,
} from "../chat.ts";
import { resolveAgentDataDir } from "./paths.ts";
import { resolveAgentsDataDir } from "./tools/khora/_helpers/khora-client-factory.ts";

export const HARNESS_AGENT_DEV_THREAD_ID = "harness-agent-self";

let backend: SignedChatBackend | undefined;
let devAgentDid: string | undefined;

function devAgentKeyPath(): string {
  return path.join(resolveAgentsDataDir(), "dev-agent", "identity.json");
}

export async function ensureDevAgentIdentity(): Promise<RelaySigner> {
  const signer = await loadOrCreateIdentity(devAgentKeyPath());
  devAgentDid = signer.did;
  return signer;
}

export async function getDevAgentDid(): Promise<string> {
  return (await ensureDevAgentIdentity()).did;
}

async function resolveHarnessSigner(did: string): Promise<RelaySigner | undefined> {
  const devDid = devAgentDid ?? (await ensureDevAgentIdentity()).did;
  if (did === devDid) {
    return loadOrCreateIdentity(devAgentKeyPath());
  }
  return loadIdentity(AgentStore.keyPath(resolveAgentsDataDir(), did));
}

function getSignedChatBackend(): SignedChatBackend {
  if (backend !== undefined) return backend;
  backend = createSignedChatService(resolveAgentDataDir(), {
    resolveSigner: resolveHarnessSigner,
  });
  return backend;
}

export function getAgentChatService(): ChatService {
  return getSignedChatBackend().service;
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
