import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

import type { AgentChatClient } from "../../../chat";
import {
  agentMemoriesDatabase,
  createHarnessMemoriesClient,
} from "../memories/_helpers/memories-client";
import { resolveRecentNamespacesTracker } from "../memories/_helpers/recent-namespaces";
import { discoverSkillsFromMemories } from "../skills/_helpers/skills";
import type { HarnessToolkitEnv } from "../types";

async function getMemoriesProvenanceHeadRootHex(
  client: RemoteMemoriesClientAsync,
): Promise<string> {
  const fn = client.persistence.getProvenanceHeadRootHex;
  if (fn === undefined) return "";
  const out = await fn.call(client.persistence);
  return out ?? "";
}

export async function createHarnessToolkitEnv(input: {
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  agentChat?: AgentChatClient;
  agentDid?: string;
  sessionId?: string;
  networkDataDir?: string;
  embeddingModel?: EmbeddingModel;
}): Promise<HarnessToolkitEnv> {
  const agentDid = input.agentDid?.trim() || input.agentChat?.did;
  const recentNamespaces = await resolveRecentNamespacesTracker({
    agentDid,
    networkDataDir: input.networkDataDir,
  });

  const env: HarnessToolkitEnv = {
    memoriesClient: input.memoriesClient,
    khoraClient: input.khoraClient,
    agentChat: input.agentChat,
    agentDid,
    sessionId: input.sessionId,
    networkDataDir: input.networkDataDir,
    embeddingModel: input.embeddingModel,
    embeddingCache: new Map(),
    skills: [],
    activatedSkillNames: new Set(),
    recentNamespaces,
  };

  if (input.memoriesClient === undefined) return env;

  env.memoriesSnapshotRootHex =
    (await getMemoriesProvenanceHeadRootHex(input.memoriesClient)) ?? "";
  env.skills = await discoverSkillsFromMemories(input.memoriesClient);
  return env;
}

export async function createHarnessMemoriesClientForAgent(opts: {
  baseUrl: string;
  agentDid: string;
}): Promise<RemoteMemoriesClientAsync> {
  return createHarnessMemoriesClient({
    baseUrl: opts.baseUrl,
    database: agentMemoriesDatabase(opts.agentDid),
  });
}

export function resolveMemoriesServiceBaseUrl(): string | undefined {
  const value =
    process.env.MEMORIES_SERVICE_URL?.trim() ||
    process.env.HARNESS_MEMORIES_BASE_URL?.trim() ||
    process.env.MEMORIES_BASE_URL?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

export type HarnessAgentWorkflowDeps = Pick<
  import("../../run-agent-workflow.ts").RunAgentWorkflowDependencies,
  | "memoriesClient"
  | "khoraClient"
  | "embeddingModel"
  | "chatService"
  | "agentChat"
  | "sessionId"
  | "networkDataDir"
  | "chatDb"
>;

export async function createHarnessAgentWorkflowDeps(input: {
  memoriesBaseUrl: string;
  agentDid: string;
  khoraClient?: KhoraClient;
  embeddingModel?: import("@khoralabs/memories-core/helpers").EmbeddingModel;
}): Promise<HarnessAgentWorkflowDeps> {
  return {
    memoriesClient: await createHarnessMemoriesClientForAgent({
      baseUrl: input.memoriesBaseUrl,
      agentDid: input.agentDid,
    }),
    khoraClient: input.khoraClient,
    embeddingModel: input.embeddingModel,
  };
}
