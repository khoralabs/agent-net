import path from "node:path";

import { createRegisteredAgent } from "@khoralabs/agent-capabilities";
import type { ChatService } from "@khoralabs/chat-core";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-ontologies";
import {
  ensureDatabaseOntologyLink,
  type MemoriesServiceClient,
  type RemoteMemoriesClientAsync,
  storedOntologyFromDefinition,
} from "@khoralabs/memories-service-client";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service-storage-core";

import { getAgentRegistry } from "./agent/agent-runtime.ts";
import type { RunAgentWorkflowDependencies } from "./agent/run-agent-workflow.ts";
import { harnessToolkit } from "./agent/tools/index.ts";
import { createHarnessKhoraClientForAgent } from "./agent/tools/khora/_helpers/khora-client-factory.ts";
import {
  agentMemoriesDatabase,
  createHarnessMemoriesClient,
  createLazyHarnessMemoriesClient,
  type HarnessMemoriesOntology,
  resolveHarnessMemoriesOntology,
} from "./agent/tools/memories/_helpers/memories-client.ts";
import type { AgentHandle, AgentMemoriesClient, ManagedAgentPool } from "./agents";
import type { AgentChatClient, HarnessChat, SignedChatBackend } from "./chat.ts";
import { registerNetworkSession, removeNetworkSession } from "./network/session-registry.ts";

export type SpawnWithMemoriesOptions = {
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;
};

export type RegisterHarnessAgentInput = {
  agent: AgentHandle;
  name: string;
  instructions: string[];
  context: Record<string, unknown>;
};

export type EnsureHarnessAgentRegisteredInput = {
  agentDid: string;
  name: string;
  instructions: string[];
  context: Record<string, unknown>;
};

export type ResolveHarnessAgentWorkflowDepsOpts = {
  sessionId: string;
  dataDir: string;
};

export type HarnessAgentWorkflowDeps = {
  chatService: ChatService;
  agentChat: AgentChatClient;
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  sessionId: string;
  networkDataDir: string;
};

export type BindNetworkSessionInput = {
  sessionId: string;
  dataDir: string;
  resolveAgentWorkflowDeps: (agentDid: string) => Promise<RunAgentWorkflowDependencies>;
  ensureAgentRegistered?: (agentDid: string) => Promise<void>;
};

/** Core harness fields needed by agent APIs (before methods are attached). */
export type NetworkHarnessCore = {
  readonly serverBaseUrl: string;
  readonly relayBaseUrl: string;
  readonly memoriesBaseUrl: string;
  readonly agentDids: readonly string[];
  readonly memoriesClient: MemoriesServiceClient;
  readonly pool: ManagedAgentPool;
  readonly chat: HarnessChat;
  readonly signedChat: SignedChatBackend;
  stop(): void;
};

export type NetworkHarnessAgentApi = {
  spawn(opts: SpawnWithMemoriesOptions): Promise<AgentHandle>;
  registerAgent(input: RegisterHarnessAgentInput): Promise<{ staticHash: string }>;
  ensureAgentRegistered(input: EnsureHarnessAgentRegisteredInput): Promise<void>;
  resolveAgentWorkflowDeps(
    agent: AgentHandle,
    opts: ResolveHarnessAgentWorkflowDepsOpts,
  ): Promise<HarnessAgentWorkflowDeps>;
  bindNetworkSession(input: BindNetworkSessionInput): void;
  unbindNetworkSession(sessionId: string): void;
};

/**
 * Spawn a new agent and bind memories + chat in one step.
 * Returns a single {@link AgentHandle} with inbox, vellum, memories, and chat.
 */
export async function spawnWithMemories(
  harness: NetworkHarnessCore,
  opts: SpawnWithMemoriesOptions,
): Promise<AgentHandle> {
  const ontology: HarnessMemoriesOntology = resolveHarnessMemoriesOntology(opts.ontology);
  let capturedHandle: AgentHandle | undefined;

  const did = await harness.pool.spawn(async (handle) => {
    capturedHandle = handle;
    const database: MemoriesDatabaseId = { kind: "account", ownerKey: handle.did };
    await harness.memoriesClient.openDatabase(database);
    await ensureDatabaseOntologyLink({
      serviceClient: harness.memoriesClient,
      database,
      schema: storedOntologyFromDefinition(ontology),
    });
  });

  const agent = capturedHandle;
  if (agent === undefined) {
    throw new Error("Failed to capture agent handle during spawn");
  }

  const database: MemoriesDatabaseId = { kind: "account", ownerKey: did };
  const { memoriesClient } = harness;
  const memories: AgentMemoriesClient = {
    database,
    ontology,
    open: () => memoriesClient.openDatabase(database),
    close: () => memoriesClient.closeDatabase(database),
    checkpoint: () => memoriesClient.checkpointDatabase(database),
    exists: () => memoriesClient.databaseExists(database),
    delete: () => memoriesClient.deleteDatabase(database),
    serviceClient: memoriesClient,
    client: createLazyHarnessMemoriesClient({
      baseUrl: harness.memoriesBaseUrl,
      database,
      ontology,
    }),
  };

  return agent.bindServices(memories, harness.chat.forAgent(did));
}

export function createHarnessAgentApi(
  harness: NetworkHarnessCore,
  opts: { agentsDataDir: string },
): NetworkHarnessAgentApi {
  return {
    spawn(spawnOpts) {
      return spawnWithMemories(harness, spawnOpts);
    },

    async registerAgent(input) {
      const { staticHash, agent: registered } = await createRegisteredAgent({
        agentId: input.agent.did,
        name: input.name,
        instructions: input.instructions,
        context: input.context,
        rootComposable: harnessToolkit,
      });
      const registry = getAgentRegistry();
      if (!registry.has(input.agent.did)) {
        await registry.register(registered);
      }
      return { staticHash };
    },

    async ensureAgentRegistered(input) {
      const registry = getAgentRegistry();
      if (registry.has(input.agentDid)) return;
      const { agent } = await createRegisteredAgent({
        agentId: input.agentDid,
        name: input.name,
        instructions: input.instructions,
        context: input.context,
        rootComposable: harnessToolkit,
      });
      await registry.register(agent);
    },

    async resolveAgentWorkflowDeps(agent, resolveOpts) {
      const memoriesClient = await createHarnessMemoriesClient({
        baseUrl: harness.memoriesBaseUrl,
        database: agentMemoriesDatabase(agent.did),
        ontology: agent.memories.ontology,
      });
      const khoraClient = await createHarnessKhoraClientForAgent({
        baseUrl: harness.serverBaseUrl,
        agentDid: agent.did,
        agentsDataDir: opts.agentsDataDir,
      });
      return {
        chatService: harness.signedChat.service,
        agentChat: agent.chat,
        memoriesClient,
        khoraClient,
        sessionId: resolveOpts.sessionId,
        networkDataDir: resolveOpts.dataDir,
      };
    },

    bindNetworkSession(input) {
      registerNetworkSession({
        sessionId: input.sessionId,
        dataDir: input.dataDir,
        resolveAgentWorkflowDeps: input.resolveAgentWorkflowDeps,
        ensureAgentRegistered: input.ensureAgentRegistered,
      });
    },

    unbindNetworkSession(sessionId) {
      removeNetworkSession(sessionId);
    },
  };
}

/** Agents data dir for a harness rooted at `dataDir`. */
export function harnessAgentsDataDir(dataDir: string): string {
  return path.join(dataDir, "agents");
}
