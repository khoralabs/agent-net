import path from "node:path";

import { createRegisteredAgent } from "@khoralabs/agent-capabilities";
import type { ChatSigner } from "@khoralabs/chat";
import type { IdentitySecret, PersistableSigner } from "@khoralabs/did-key-identity";
import type { KhoraClient } from "@khoralabs/khora-client";
import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-node/ontology";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import {
  createBearerTokenAuthProvider,
  ensureDatabaseOntologyLink,
  MemoriesServiceClient,
  type RemoteMemoriesClientAsync,
  storedOntologyFromDefinition,
} from "@khoralabs/memories-service/client";
import {
  type AgentMemoriesOntology,
  agentMemoriesDatabase,
  createAgentMemoriesClient,
  createDeferredAgentMemoriesClient,
  memoriesServiceFetch,
  resolveAgentMemoriesOntology,
} from "@khoralabs/memories-service/client/agent";
import type { AgentHandle } from "../../agent/handle.ts";
import { createBoundAgentMemoriesClient } from "../../agent/memories-types.ts";
import {
  type AgentChatClient,
  type ChatServiceClient,
  createRemoteHarnessChat,
  type HarnessChat,
  type SignedChatBackend,
} from "../../agent/social/message/chat.ts";
import { createHarnessChatCrypto } from "../../agent/social/message/chat-crypto.ts";
import { createHarnessKhoraClientForAgent } from "../../agent/social/tools/_helpers/khora-client-factory.ts";
import { getCapabilityRegistry } from "../../agent/turn/agent-runtime.ts";
import type { RunAgentWorkflowDependencies } from "../../agent/turn/run-agent-workflow.ts";
import { harnessToolkit } from "../../agent/turn/tools/index.ts";
import { requireChatBaseUrl, requireChatToken } from "../../lib/chat-base-url.ts";
import { requireMemoriesAdminToken } from "../../lib/memories-base-url.ts";
import { loadHarnessIdentity, resolveIdentitySecretFromEnv } from "../identity-wrap-key.ts";
import { HarnessPoolInbox, type PoolInboxEvent } from "../inbox/pool-inbox.ts";
import { mintKhoraInviteTokens, resolveKhoraAdminTokenFromEnv } from "../khora-admin-invites.ts";
import {
  emitNetworkEvent,
  installNetworkEventsPlugin,
  type NetworkEventsPlugin,
  networkEventId,
} from "../network/index.ts";
import { registerNetworkSession, removeNetworkSession } from "../network/session-registry.ts";
import { getNetworkSessionContext } from "../observability/network-log.ts";
import { PerAgentInviteBank } from "../per-agent-invite-bank.ts";
import { ManagedAgentPool } from "../pool.ts";
import type { PoolAgentRegistry } from "../store.ts";
import { AgentStore } from "../store.ts";

export type { AgentMemoriesClient } from "../../agent/memories-types.ts";

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

export type NetworkHarnessOptions = {
  dataDir: string;
  /** Base URL of a running chat-http service. */
  chatBaseUrl: string;
  /** Shared-secret token for chat-http. */
  chatToken: string;
  /**
   * Channel id for harness chat threads.
   * Defaults to {@link createRemoteHarnessChat}'s soft default (`harness-network`).
   */
  chatChannelId?: string;
  /**
   * Optional operator principal for `forScope({ type: "user", id })` (e.g. host UI).
   * When omitted, no UI user identity is created or registered.
   */
  operator?: { signer: PersistableSigner };
  /** Optional host network-event sink (sqlite + JSONL, etc.). */
  networkEvents?: NetworkEventsPlugin;
  /** Base URL of a running Khora host (e.g. http://127.0.0.1:8788). */
  khoraBaseUrl: string;
  /** Base URL of a running relay server (e.g. http://127.0.0.1:8790). */
  relayBaseUrl: string;
  /** Base URL of a running memories service (e.g. http://127.0.0.1:8791). */
  memoriesBaseUrl: string;
  /** Shared-secret Bearer token for memories server-admin auth. */
  memoriesAdminToken: string;
  /**
   * Khora host admin Bearer token for minting invites on spawn.
   * Falls back to `KHORA_ADMIN_TOKEN` / `ADMIN_ROOT_TOKEN` / `KHORA_CONSOLE_ROOT_TOKEN`.
   */
  khoraAdminToken?: string;
  /**
   * Wrap key for sealing agent identity files.
   * Falls back to `HARNESS_IDENTITY_WRAP_KEY` (32-byte base64/hex).
   */
  identitySecret?: IdentitySecret;
  /**
   * Optional injected agent registry (e.g. host SQLite-backed store).
   * When omitted, opens the legacy file-backed AgentStore under agentsDataDir.
   */
  agentRegistry?: PoolAgentRegistry;
};

export type NetworkHarnessHandle = NetworkHarnessCore & NetworkHarnessAgentApi;

function bindAgentServices(
  harness: NetworkHarnessCore,
  agent: AgentHandle,
  ontology: AgentMemoriesOntology,
): AgentHandle {
  const database: MemoriesDatabaseId = { kind: "account", ownerKey: agent.did };
  const memories = createBoundAgentMemoriesClient({
    database,
    ontology,
    serviceClient: harness.memoriesClient,
    client: createDeferredAgentMemoriesClient({
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
  const ontology: AgentMemoriesOntology = resolveAgentMemoriesOntology(opts.ontology);
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

function createHarnessAgentApi(
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
      const ontology: AgentMemoriesOntology = resolveAgentMemoriesOntology(getOpts.ontology);
      return bindAgentServices(harness, agent, ontology);
    },

    async getOrSpawn(opts) {
      const externalId = opts.externalId?.trim();
      if (externalId !== undefined && externalId.length > 0) {
        const existingDid = harness.pool.getDidByExternalId(externalId);
        if (existingDid !== undefined) {
          const agent = await harness.pool.focus(existingDid);
          const ontology: AgentMemoriesOntology = resolveAgentMemoriesOntology(opts.ontology);
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
      const memoriesClient = await createAgentMemoriesClient({
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

export async function startNetworkHarness(
  opts: NetworkHarnessOptions,
): Promise<NetworkHarnessHandle> {
  const khoraBaseUrl = opts.khoraBaseUrl.trim().replace(/\/$/, "");
  if (khoraBaseUrl.length === 0) {
    throw new Error("startNetworkHarness: khoraBaseUrl is required");
  }

  const relayBaseUrl = opts.relayBaseUrl.trim().replace(/\/$/, "");
  if (relayBaseUrl.length === 0) {
    throw new Error("startNetworkHarness: relayBaseUrl is required");
  }

  const memoriesBaseUrl = opts.memoriesBaseUrl.trim().replace(/\/$/, "");
  if (memoriesBaseUrl.length === 0) {
    throw new Error("startNetworkHarness: memoriesBaseUrl is required");
  }

  const chatBaseUrl = requireChatBaseUrl(opts.chatBaseUrl);
  const chatToken = requireChatToken(opts.chatToken);
  const memoriesAdminToken = requireMemoriesAdminToken(opts.memoriesAdminToken);
  const khoraAdminToken =
    opts.khoraAdminToken?.trim() || resolveKhoraAdminTokenFromEnv() || undefined;
  const identitySecret = opts.identitySecret ?? resolveIdentitySecretFromEnv();
  const operatorSigner = opts.operator?.signer;

  if (opts.networkEvents !== undefined) {
    installNetworkEventsPlugin(opts.networkEvents);
  }

  const agentsDataDir = harnessAgentsDataDir(opts.dataDir);
  const inviteBank = new PerAgentInviteBank(agentsDataDir);

  const memoriesClient = new MemoriesServiceClient({
    baseUrl: memoriesBaseUrl,
    auth: createBearerTokenAuthProvider(memoriesAdminToken),
    fetch: memoriesServiceFetch(),
  });

  const poolInbox = new HarnessPoolInbox({ khoraBaseUrl });

  const pool = await ManagedAgentPool.create({
    dataDir: agentsDataDir,
    baseUrl: khoraBaseUrl,
    identitySecret,
    inviteBank,
    onMemberAdded: (handle) => poolInbox.add(handle.signer),
    onMemberRemoving: (did) => poolInbox.remove(did),
    ...(opts.agentRegistry !== undefined ? { agentRegistry: opts.agentRegistry } : {}),
    ...(khoraAdminToken !== undefined && khoraAdminToken.length > 0
      ? {
          mintInvite: async () => {
            const tokens = await mintKhoraInviteTokens({
              baseUrl: khoraBaseUrl,
              adminToken: khoraAdminToken,
              count: 1,
            });
            const token = tokens[0];
            if (token === undefined) {
              throw new Error("startNetworkHarness: admin mint returned no token");
            }
            return token;
          },
        }
      : {}),
  });

  const loadSigner = async (did: string): Promise<PersistableSigner | undefined> => {
    if (operatorSigner !== undefined && did === operatorSigner.did) {
      return operatorSigner;
    }
    return loadHarnessIdentity(AgentStore.keyPath(agentsDataDir, did), identitySecret);
  };

  const signedChat = createRemoteHarnessChat({
    baseUrl: chatBaseUrl,
    token: chatToken,
    resolveSigner: loadSigner,
    ...(opts.chatChannelId !== undefined ? { channelId: opts.chatChannelId } : {}),
  });
  const chat: HarnessChat = {
    forAgent(did: string) {
      return signedChat.forAgent(did);
    },
    forScope(scope) {
      return signedChat.forScope(scope);
    },
  };

  const session = getNetworkSessionContext();
  if (session !== undefined) {
    void emitNetworkEvent({
      eventId: networkEventId({
        sessionId: session.sessionId,
        kind: "harness.started",
      }),
      sessionId: session.sessionId,
      tsMs: Date.now(),
      source: "harness",
      kind: "harness.started",
      message: "Network harness started",
      payload: {
        serverBaseUrl: khoraBaseUrl,
        relayBaseUrl,
        memoriesBaseUrl,
        chatBaseUrl,
      },
    });
  }

  // Bind agents already on disk (create().count may have already bound new ones).
  for (const did of pool.list()) {
    if (poolInbox.list().includes(did)) continue;
    const handle = await pool.focus(did);
    await poolInbox.add(handle.signer);
  }

  const core: NetworkHarnessCore = {
    serverBaseUrl: khoraBaseUrl,
    relayBaseUrl,
    memoriesBaseUrl,
    memoriesAdminToken,
    chatBaseUrl,
    identitySecret,
    inviteBank,
    get agentDids() {
      return pool.list();
    },
    memoriesClient,
    pool,
    poolInbox,
    chat,
    signedChat,
    uiUserDid: operatorSigner?.did,
    async listInvitesForAgent(did: string) {
      const signer = await loadSigner(did);
      if (signer === undefined) {
        throw new Error(`listInvitesForAgent: key file missing for ${did}`);
      }
      return inviteBank.list(signer);
    },
    subscribeInbox(onEvent) {
      return poolInbox.subscribe(onEvent);
    },
    stop() {
      poolInbox.close();
      const ctx = getNetworkSessionContext();
      if (ctx !== undefined) {
        void emitNetworkEvent({
          eventId: networkEventId({
            sessionId: ctx.sessionId,
            kind: "harness.stopped",
          }),
          sessionId: ctx.sessionId,
          tsMs: Date.now(),
          source: "harness",
          kind: "harness.stopped",
          message: "Network harness stopped",
        });
      }
      opts.networkEvents?.close?.();
    },
  };

  const agentApi = createHarnessAgentApi(core, {
    agentsDataDir,
    identitySecret,
  });
  return Object.assign(core, agentApi);
}
