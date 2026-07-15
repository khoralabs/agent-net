import path from "node:path";

import { loadIdentity } from "@khoralabs/did-key-identity";
import { createNoAuthProvider, MemoriesServiceClient } from "@khoralabs/memories-service-client";
import { AgentStore, ManagedAgentPool } from "./agents";
import { createSignedChatService, type HarnessChat } from "./chat";
import {
  createHarnessAgentApi,
  harnessAgentsDataDir,
  type NetworkHarnessAgentApi,
  type NetworkHarnessCore,
} from "./harness-agents.ts";
import { startMemoriesService } from "./memories";
import {
  emitNetworkEvent,
  getNetworkLogContext,
  networkEventId,
} from "./observability/network-log.ts";

export type { AgentMemoriesClient } from "./agents";
export type {
  BindNetworkSessionInput,
  EnsureHarnessAgentRegisteredInput,
  HarnessAgentWorkflowDeps,
  NetworkHarnessAgentApi,
  RegisterHarnessAgentInput,
  ResolveHarnessAgentWorkflowDepsOpts,
} from "./harness-agents.ts";
export { spawnWithMemories } from "./harness-agents.ts";

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

export type NetworkHarnessHandle = NetworkHarnessCore & NetworkHarnessAgentApi;

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
  const agentsDataDir = harnessAgentsDataDir(opts.dataDir);

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

  const core: NetworkHarnessCore = {
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

  const agentApi = createHarnessAgentApi(core, { agentsDataDir });
  return Object.assign(core, agentApi);
}
