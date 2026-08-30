import path from "node:path";

import { createRegisteredAgent } from "@khoralabs/agent-capabilities";
import type { ChatSigner } from "@khoralabs/chat";
import type { IdentitySecret } from "@khoralabs/did-key-identity";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-node/ontology";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import {
  ensureDatabaseOntologyLink,
  type MemoriesServiceClient,
  type RemoteMemoriesClientAsync,
  storedOntologyFromDefinition,
} from "@khoralabs/memories-service/client";
import type { AgentHandle } from "../../agent/handle.ts";
import {
  agentMemoriesDatabase,
  createDeferredHarnessMemoriesClient,
  createHarnessMemoriesClient,
  type HarnessMemoriesOntology,
  resolveHarnessMemoriesOntology,
} from "../../agent/memories/tools/_helpers/memories-client.ts";
import { createBoundAgentMemoriesClient } from "../../agent/memories-types.ts";
import type {
  AgentChatClient,
  ChatServiceClient,
  HarnessChat,
  SignedChatBackend,
} from "../../agent/social/message/chat.ts";
import { createHarnessChatCrypto } from "../../agent/social/message/chat-crypto.ts";
import { createHarnessKhoraClientForAgent } from "../../agent/social/tools/_helpers/khora-client-factory.ts";
import { getCapabilityRegistry } from "../../agent/turn/agent-runtime.ts";
import type { RunAgentWorkflowDependencies } from "../../agent/turn/run-agent-workflow.ts";
import { harnessToolkit } from "../../agent/turn/tools/index.ts";
import { loadHarnessIdentity } from "../identity-wrap-key.ts";
import type { HarnessPoolInbox, PoolInboxEvent } from "../inbox/pool-inbox.ts";
import { registerNetworkSession, removeNetworkSession } from "../network/session-registry.ts";
import type { PerAgentInviteBank } from "../per-agent-invite-bank.ts";
import type { ManagedAgentPool } from "../pool.ts";
import { AgentStore } from "../store.ts";

export type SpawnWithMemoriesOptions = {
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;
  /** Optional opaque external linkage id (tenant/org/etc.). */
  externalId?: string;
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
  /** DID of an optional host-supplied operator (human ↔ agent chat). */
  readonly uiUserDid: string | undefined;
  /** Decrypt and list registration-issued invites for an agent (sovereign viral use later). */
  listInvitesForAgent(did: string): Promise<string[]>;
  /** Subscribe to harness multiplex inbox events (demux by `event.did`). */
  subscribeInbox(onEvent: (event: PoolInboxEvent) => void): () => void;
  stop(): void;
};

export type NetworkHarnessAgentApi = {
  spawn(opts: SpawnWithMemoriesOptions): Promise<AgentHandle>;
  /**
   * Return a fully service-bound handle for an existing pool agent
   * (`memories` + `social`). Prefer over {@link ManagedAgentPool.focus}.
   */
  get(did: string, opts: { ontology: SpawnWithMemoriesOptions["ontology"] }): Promise<AgentHandle>;
  /**
   * Return the agent linked to `externalId`, spawning one if missing.
   * When `externalId` is omitted, always spawns a new agent.
   */
  getOrSpawn(opts: SpawnWithMemoriesOptions): Promise<{
    agent: AgentHandle;
    created: boolean;
  }>;
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

function bindAgentServices(
  harness: NetworkHarnessCore,
  agent: AgentHandle,
  ontology: HarnessMemoriesOntology,
): AgentHandle {
  const database: MemoriesDatabaseId = { kind: "account", ownerKey: agent.did };
  const memories = createBoundAgentMemoriesClient({
    database,
    ontology,
    serviceClient: harness.memoriesClient,
    client: createDeferredHarnessMemoriesClient({
      baseUrl: harness.memoriesBaseUrl,
      database,
      ontology,
      adminToken: harness.memoriesAdminToken,
    }),
  });
  return agent.bindServices({
    memories,
    chat: harness.chat.forAgent(agent.did),
    listInvites: () => harness.listInvitesForAgent(agent.did),
  });
}

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

  const did = await harness.pool.spawn(
    async (handle) => {
      capturedHandle = handle;
      const database: MemoriesDatabaseId = { kind: "account", ownerKey: handle.did };
      await harness.memoriesClient.openDatabase(database);
      await ensureDatabaseOntologyLink({
        serviceClient: harness.memoriesClient,
        database,
        schema: storedOntologyFromDefinition(ontology),
      });
    },
    opts.externalId !== undefined ? { externalId: opts.externalId } : undefined,
  );

  const agent = capturedHandle;
  if (agent === undefined) {
    throw new Error("Failed to capture agent handle during spawn");
  }
  void did;
  return bindAgentServices(harness, agent, ontology);
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

    async get(did, getOpts) {
      const agent = await harness.pool.focus(did);
      const ontology: HarnessMemoriesOntology = resolveHarnessMemoriesOntology(getOpts.ontology);
      return bindAgentServices(harness, agent, ontology);
    },

    async getOrSpawn(opts) {
      const externalId = opts.externalId?.trim();
      if (externalId !== undefined && externalId.length > 0) {
        const existingDid = harness.pool.getDidByExternalId(externalId);
        if (existingDid !== undefined) {
          const agent = await harness.pool.focus(existingDid);
          const ontology: HarnessMemoriesOntology = resolveHarnessMemoriesOntology(opts.ontology);
          return {
            agent: bindAgentServices(harness, agent, ontology),
            created: false,
          };
        }
        const agent = await spawnWithMemories(harness, {
          ontology: opts.ontology,
          externalId,
        });
        return { agent, created: true };
      }
      const agent = await spawnWithMemories(harness, {
        ontology: opts.ontology,
      });
      return { agent, created: true };
    },

    async removeAgent(did) {
      // ManagedAgentPool.onMemberRemoving unbinds from poolInbox.
      await harness.pool.remove(did);
      const database = agentMemoriesDatabase(did);
      try {
        if (await harness.memoriesClient.databaseExists(database)) {
          await harness.memoriesClient.deleteDatabase(database);
        }
      } catch (err) {
        console.error(`removeAgent: failed to delete memories for ${did}`, err);
      }
    },

    async registerAgent(input) {
      const { staticHash, agent: registered } = await createRegisteredAgent({
        agentId: input.agent.did,
        name: input.name,
        instructions: input.instructions,
        context: input.context,
        rootComposable: harnessToolkit,
      });
      const registry = getCapabilityRegistry();
      if (!registry.has(input.agent.did)) {
        await registry.register(registered);
      }
      return { staticHash };
    },

    async ensureAgentRegistered(input) {
      const registry = getCapabilityRegistry();
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
