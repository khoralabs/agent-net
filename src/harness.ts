import path from "node:path";

import { loadIdentity } from "@khoralabs/did-key-identity";
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

export type { AgentMemoriesClient } from "./agents";

export type NetworkHarnessOptions = {
  dataDir: string;
  /** Base URL of a running Khora host (e.g. http://127.0.0.1:8788). */
  khoraBaseUrl: string;
  /** Base URL of a running relay server (e.g. http://127.0.0.1:8790). */
  relayBaseUrl: string;
  /** Override the port the memories service binds to. Defaults to a random free port. */
  memoriesPort?: number;
  sqlCipherKey?: string;
};

export type NetworkHarnessHandle = {
  /** Base URL of the remote khora server. */
  readonly serverBaseUrl: string;
  /** Base URL of the remote relay server (for vellum channel operations). */
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
  /** Tear down memories. Does not stop the remote khora host, relay, or unregister agents. */
  stop(): void;
};

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

  const memoriesDataDir = path.join(opts.dataDir, "memories");
  const agentsDataDir = path.join(opts.dataDir, "agents");

  // Memories must start first — it calls Database.setCustomSQLite which must
  // run before any bun:sqlite Database is opened (e.g. signed chat).
  const memories = startMemoriesService({
    dataDir: memoriesDataDir,
    sqlCipherKey: opts.sqlCipherKey ?? "harness-memories-key",
    port: opts.memoriesPort,
  });

  const memoriesClient = new MemoriesServiceClient({
    baseUrl: memories.baseUrl,
    auth: createNoAuthProvider(),
  });

  const pool = await ManagedAgentPool.create({
    dataDir: agentsDataDir,
    baseUrl: khoraBaseUrl,
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
        serverBaseUrl: khoraBaseUrl,
        relayBaseUrl,
        memoriesBaseUrl: memories.baseUrl,
      },
    });
  }

  return {
    serverBaseUrl: khoraBaseUrl,
    relayBaseUrl,
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
