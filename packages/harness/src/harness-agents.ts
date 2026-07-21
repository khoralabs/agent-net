import path from "node:path";

import { createRegisteredAgent } from "@khoralabs/agent-capabilities";
import type { ChatSigner } from "@khoralabs/chat-core";
import type { IdentitySecret } from "@khoralabs/did-key-identity";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-ontologies";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import {
  ensureDatabaseOntologyLink,
  type MemoriesServiceClient,
  type RemoteMemoriesClientAsync,
  storedOntologyFromDefinition,
} from "@khoralabs/memories-service/client";

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
import {
  type AgentHandle,
  type AgentMemoriesClient,
  AgentStore,
  type HarnessPoolInbox,
  type ManagedAgentPool,
  type PoolInboxEvent,
} from "./agents";
import type { AgentChatClient, ChatServiceClient, HarnessChat, SignedChatBackend } from "./chat.ts";
import { createHarnessChatCrypto } from "./chat-crypto.ts";
import { loadHarnessIdentity } from "./lib/identity-wrap-key.ts";
import type { PerAgentInviteBank } from "./lib/per-agent-invite-bank.ts";
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
  chatService: ChatServiceClient;
  chatSigner: ChatSigner;
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
  readonly memoriesAdminToken: string;
  readonly chatBaseUrl: string;
  readonly identitySecret: IdentitySecret | undefined;
  readonly inviteBank: PerAgentInviteBank;
  readonly agentDids: readonly string[];
  readonly memoriesClient: MemoriesServiceClient;
  readonly pool: ManagedAgentPool;
  readonly poolInbox: HarnessPoolInbox;
  readonly chat: HarnessChat;
  readonly signedChat: SignedChatBackend;
  /** Decrypt and list registration-issued invites for an agent (sovereign viral use later). */
  listInvitesForAgent(did: string): Promise<string[]>;
  /** Subscribe to harness multiplex inbox events (demux by `event.did`). */
  subscribeInbox(onEvent: (event: PoolInboxEvent) => void): () => void;
  stop(): void;
};

export type NetworkHarnessAgentApi = {
  spawn(opts: SpawnWithMemoriesOptions): Promise<AgentHandle>;
  /** Unregister + remove from pool and unbind from the harness inbox multiplex. */
  removeAgent(did: string): Promise<void>;
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
      adminToken: harness.memoriesAdminToken,
    }),
  };

  return agent.bindServices(memories, harness.chat.forAgent(did));
}

export function createHarnessAgentApi(
  harness: NetworkHarnessCore,
  opts: { agentsDataDir: string; identitySecret?: IdentitySecret },
): NetworkHarnessAgentApi {
  const identitySecret = opts.identitySecret ?? harness.identitySecret;
  return {
    spawn(spawnOpts) {
      return spawnWithMemories(harness, spawnOpts);
    },

    async removeAgent(did) {
      // ManagedAgentPool.onMemberRemoving unbinds from poolInbox.
      await harness.pool.remove(did);
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
        adminToken: harness.memoriesAdminToken,
      });
      const khoraClient = await createHarnessKhoraClientForAgent({
        baseUrl: harness.serverBaseUrl,
        agentDid: agent.did,
        agentsDataDir: opts.agentsDataDir,
        identitySecret,
      });
      const chatCrypto = createHarnessChatCrypto((did) =>
        loadHarnessIdentity(AgentStore.keyPath(opts.agentsDataDir, did), identitySecret),
      );
      return {
        chatService: harness.signedChat.client,
        chatSigner: chatCrypto.signer,
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
