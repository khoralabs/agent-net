import type { IdentitySecret, PersistableSigner } from "@khoralabs/did-key-identity";
import {
  createBearerTokenAuthProvider,
  MemoriesServiceClient,
} from "@khoralabs/memories-service-client";
import { AgentStore, ManagedAgentPool } from "./agents";
import { createRemoteHarnessChat, type HarnessChat } from "./chat";
import {
  createHarnessAgentApi,
  harnessAgentsDataDir,
  type NetworkHarnessAgentApi,
  type NetworkHarnessCore,
} from "./harness-agents.ts";
import { requireChatBaseUrl, requireChatToken } from "./lib/chat-base-url.ts";
import { loadHarnessIdentity, resolveIdentitySecretFromEnv } from "./lib/identity-wrap-key.ts";
import { mintKhoraInviteTokens, resolveKhoraAdminTokenFromEnv } from "./lib/khora-admin-invites.ts";
import { requireMemoriesAdminToken } from "./lib/memories-base-url.ts";
import { PerAgentInviteBank } from "./lib/per-agent-invite-bank.ts";
import {
  emitNetworkEvent,
  installNetworkEventsPlugin,
  type NetworkEventsPlugin,
  networkEventId,
} from "./network";
import { getNetworkSessionContext } from "./observability/network-log.ts";

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
  /** Base URL of a running chat-http service. */
  chatBaseUrl: string;
  /** Shared-secret token for chat-http. */
  chatToken: string;
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

  const chatBaseUrl = requireChatBaseUrl(opts.chatBaseUrl);
  const chatToken = requireChatToken(opts.chatToken);
  const memoriesAdminToken = requireMemoriesAdminToken(opts.memoriesAdminToken);
  const khoraAdminToken =
    opts.khoraAdminToken?.trim() || resolveKhoraAdminTokenFromEnv() || undefined;
  const identitySecret = opts.identitySecret ?? resolveIdentitySecretFromEnv();

  if (opts.networkEvents !== undefined) {
    installNetworkEventsPlugin(opts.networkEvents);
  }

  const agentsDataDir = harnessAgentsDataDir(opts.dataDir);
  const inviteBank = new PerAgentInviteBank(agentsDataDir);

  const memoriesClient = new MemoriesServiceClient({
    baseUrl: memoriesBaseUrl,
    auth: createBearerTokenAuthProvider(memoriesAdminToken),
  });

  const pool = await ManagedAgentPool.create({
    dataDir: agentsDataDir,
    baseUrl: khoraBaseUrl,
    identitySecret,
    inviteBank,
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

  const loadSigner = (did: string): Promise<PersistableSigner | undefined> =>
    loadHarnessIdentity(AgentStore.keyPath(agentsDataDir, did), identitySecret);

  const signedChat = createRemoteHarnessChat({
    baseUrl: chatBaseUrl,
    token: chatToken,
    resolveSigner: loadSigner,
  });
  const chat: HarnessChat = {
    forAgent(did: string) {
      return signedChat.forAgent(did);
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
    chat,
    signedChat,
    async listInvitesForAgent(did: string) {
      const signer = await loadSigner(did);
      if (signer === undefined) {
        throw new Error(`listInvitesForAgent: key file missing for ${did}`);
      }
      return inviteBank.list(signer);
    },
    stop() {
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
