import path from "node:path";

import { loadIdentity } from "@khoralabs/did-key-identity";
import { startKhoraServer } from "@khoralabs/khora-server/start-server";
import { createNoAuthProvider, MemoriesServiceClient } from "@khoralabs/memories-service-client";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service-storage-core";
import { createLazyHarnessMemoriesClient } from "./agent/tools/memories/_helpers/memories-client.ts";
import { type AgentHandle, type AgentMemoriesClient, AgentStore, ManagedAgentPool } from "./agents";
import { createSignedChatService, type HarnessChat, type SignedChatBackend } from "./chat";
import { startMemoriesService } from "./memories";
import {
  emitNetworkEvent,
  getNetworkLogContext,
  networkEventId,
} from "./observability/network-log.ts";
import { startRelayServer } from "./relay";

export type { AgentMemoriesClient } from "./agents";

export type NetworkHarnessOptions = {
  dataDir: string;
  /** Override the port the khora server binds to. Defaults to a random free port. */
  serverPort?: number;
  /** Override the port the memories service binds to. Defaults to a random free port. */
  memoriesPort?: number;
  /** Override the port the relay server binds to. Defaults to a random free port. */
  relayPort?: number;
  sqlCipherKey?: string;
  outboxKeyHex?: string;
  cellPoolCount?: number;
};

export type NetworkHarnessHandle = {
  /** Base URL of the running khora server. */
  readonly serverBaseUrl: string;
  /** Base URL of the relay server (for vellum channel operations). */
  readonly relayBaseUrl: string;
  /** Base URL of the shared memories service. */
  readonly memoriesBaseUrl: string;
  /** All agent DIDs currently in the pool. */
  readonly agentDids: readonly string[];
  /**
   * Client for the memories management API. Use this to open, close, delete,
   * or inspect any agent's database by passing their `MemoriesDatabaseId`.
   */
  readonly memoriesClient: MemoriesServiceClient;
  /** The underlying managed agent pool — use for `focus`, `spawn`, `remove`. */
  readonly pool: ManagedAgentPool;
  /** Shared chat interface — each agent gets a scoped client via `forAgent(did)`. */
  readonly chat: HarnessChat;
  /** Underlying signed chat backend (service + db). */
  readonly signedChat: SignedChatBackend;
  /** Tear down the server and memories service. Does not unregister agents. */
  stop(): void;
};

export async function startNetworkHarness(
  opts: NetworkHarnessOptions,
): Promise<NetworkHarnessHandle> {
  const serverDataDir = path.join(opts.dataDir, "server");
  const memoriesDataDir = path.join(opts.dataDir, "memories");
  const agentsDataDir = path.join(opts.dataDir, "agents");
  const relayDataDir = path.join(opts.dataDir, "relay");

  // Memories must start first — it calls Database.setCustomSQLite which must
  // run before any bun:sqlite Database is opened by the khora or relay servers.
  const memories = startMemoriesService({
    dataDir: memoriesDataDir,
    sqlCipherKey: opts.sqlCipherKey ?? "harness-memories-key",
    port: opts.memoriesPort,
  });

  const server = await startKhoraServer({
    dataDir: serverDataDir,
    port: opts.serverPort,
    sqlCipherKey: opts.sqlCipherKey,
    outboxKeyHex: opts.outboxKeyHex,
    cellPoolCount: opts.cellPoolCount,
    useCellWorkers: false,
    enableMemories: true,
  });

  const relay = await startRelayServer({
    dataDir: relayDataDir,
    port: opts.relayPort,
    sqlCipherKey: opts.sqlCipherKey,
  });

  const memoriesClient = new MemoriesServiceClient({
    baseUrl: memories.baseUrl,
    auth: createNoAuthProvider(),
  });

  const pool = await ManagedAgentPool.create({
    dataDir: agentsDataDir,
    baseUrl: server.baseUrl,
  });

  const signedChat = createSignedChatService(opts.dataDir, {
    resolveSigner: (did) => loadIdentity(AgentStore.keyPath(agentsDataDir, did)),
  });
  const chat: HarnessChat = {
    forAgent(did: string) {
      return signedChat.forAgent(did);
    },
  };

  const logContext = getNetworkLogContext();
  if (logContext !== undefined && logContext.dataDir === opts.dataDir) {
    void emitNetworkEvent({
      dataDir: opts.dataDir,
      eventId: networkEventId({
        sessionId: logContext.sessionId,
        kind: "harness.started",
      }),
      sessionId: logContext.sessionId,
      tsMs: Date.now(),
      source: "harness",
      kind: "harness.started",
      message: "Network harness started",
      payload: {
        serverBaseUrl: server.baseUrl,
        relayBaseUrl: relay.baseUrl,
        memoriesBaseUrl: memories.baseUrl,
      },
    });
  }

  return {
    serverBaseUrl: server.baseUrl,
    relayBaseUrl: relay.baseUrl,
    memoriesBaseUrl: memories.baseUrl,
    get agentDids() {
      return pool.list();
    },
    memoriesClient,
    pool,
    chat,
    signedChat,
    stop() {
      const ctx = getNetworkLogContext();
      if (ctx !== undefined && ctx.dataDir === opts.dataDir) {
        void emitNetworkEvent({
          dataDir: opts.dataDir,
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
      memories.stop();
      relay.stop();
      server.close();
    },
  };
}

/**
 * Spawn a new agent and bind memories + chat in one step.
 * Returns a single {@link AgentHandle} with inbox, vellum, memories, and chat.
 */
export async function spawnWithMemories(harness: NetworkHarnessHandle): Promise<AgentHandle> {
  let capturedHandle: AgentHandle | undefined;

  const did = await harness.pool.spawn(async (handle) => {
    capturedHandle = handle;
    await harness.memoriesClient.openDatabase({ kind: "account", ownerKey: handle.did });
  });

  const agent = capturedHandle;
  if (agent === undefined) {
    throw new Error("Failed to capture agent handle during spawn");
  }

  const database: MemoriesDatabaseId = { kind: "account", ownerKey: did };
  const { memoriesClient } = harness;
  const memories: AgentMemoriesClient = {
    database,
    open: () => memoriesClient.openDatabase(database),
    close: () => memoriesClient.closeDatabase(database),
    checkpoint: () => memoriesClient.checkpointDatabase(database),
    exists: () => memoriesClient.databaseExists(database),
    delete: () => memoriesClient.deleteDatabase(database),
    serviceClient: memoriesClient,
    client: createLazyHarnessMemoriesClient({
      baseUrl: harness.memoriesBaseUrl,
      database,
    }),
  };

  return agent.bindServices(memories, harness.chat.forAgent(did));
}
