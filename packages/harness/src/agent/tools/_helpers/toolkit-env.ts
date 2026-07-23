import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import type { AgentChatClient } from "../../../chat.ts";
import {
  resolveMemoriesAdminTokenFromEnv,
  resolveMemoriesBaseUrlFromEnv,
} from "../../../lib/memories-base-url.ts";
import type { RunAgentWorkflowDependencies } from "../../run-agent-workflow.ts";
import {
  agentMemoriesDatabase,
  createHarnessMemoriesClient,
  type HarnessMemoriesOntology,
} from "../memories/_helpers/memories-client.ts";
import { resolveRecentNamespacesTracker } from "../memories/_helpers/recent-namespaces.ts";
import { discoverSkillsFromMemories } from "../skills/_helpers/skills.ts";
import type { HarnessToolkitEnv } from "../types.ts";

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
  ontology: HarnessMemoriesOntology;
  adminToken: string;
}): Promise<RemoteMemoriesClientAsync> {
  return createHarnessMemoriesClient({
    baseUrl: opts.baseUrl,
    database: agentMemoriesDatabase(opts.agentDid),
    ontology: opts.ontology,
    adminToken: opts.adminToken,
  });
}

export function resolveMemoriesServiceBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return resolveMemoriesBaseUrlFromEnv(env);
}

export function resolveMemoriesServiceAdminToken(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return resolveMemoriesAdminTokenFromEnv(env);
}

export type HarnessAgentWorkflowDeps = Pick<
  RunAgentWorkflowDependencies,
  | "memoriesClient"
  | "khoraClient"
  | "embeddingModel"
  | "chatService"
  | "chatSigner"
  | "agentChat"
  | "sessionId"
  | "networkDataDir"
>;

export async function createHarnessAgentWorkflowDeps(input: {
  memoriesBaseUrl: string;
  memoriesAdminToken: string;
  agentDid: string;
  ontology: HarnessMemoriesOntology;
  khoraClient?: KhoraClient;
  embeddingModel?: import("@khoralabs/memories-node/helpers").EmbeddingModel;
}): Promise<HarnessAgentWorkflowDeps> {
  return {
    memoriesClient: await createHarnessMemoriesClientForAgent({
      baseUrl: input.memoriesBaseUrl,
      agentDid: input.agentDid,
      ontology: input.ontology,
      adminToken: input.memoriesAdminToken,
    }),
    khoraClient: input.khoraClient,
    embeddingModel: input.embeddingModel,
  };
}
