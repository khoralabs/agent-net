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
  SpawnWithMemoriesOptions,
} from "./harness-agents.ts";
export { spawnWithMemories } from "./harness-agents.ts";

export type NetworkHarnessOptions = {
  dataDir: string;
  /** Base URL of a running Khora host (e.g. http://127.0.0.1:8788). */
  khoraBaseUrl: string;
  /** Base URL of a running relay server (e.g. http://127.0.0.1:8790). */
  relayBaseUrl: string;
  /** Base URL of a running memories service (e.g. http://127.0.0.1:8791). */
  memoriesBaseUrl: string;
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

  const memoriesBaseUrl = opts.memoriesBaseUrl.trim().replace(/\/$/, "");
  if (memoriesBaseUrl.length === 0) {
    throw new Error("startNetworkHarness: memoriesBaseUrl is required");
  }

  const agentsDataDir = harnessAgentsDataDir(opts.dataDir);

  const memoriesClient = new MemoriesServiceClient({
    baseUrl: memoriesBaseUrl,
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
        memoriesBaseUrl,
      },
    });
  }

  const core: NetworkHarnessCore = {
    serverBaseUrl: khoraBaseUrl,
    relayBaseUrl,
    memoriesBaseUrl,
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
    },
  };

  const agentApi = createHarnessAgentApi(core, { agentsDataDir });
  return Object.assign(core, agentApi);
}
