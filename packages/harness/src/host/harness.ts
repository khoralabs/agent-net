import type { IdentitySecret, PersistableSigner } from "@khoralabs/did-key-identity";
import {
  createBearerTokenAuthProvider,
  MemoriesServiceClient,
} from "@khoralabs/memories-service/client";
import { requireChatBaseUrl, requireChatToken } from "../lib/chat-base-url.ts";
import { requireMemoriesAdminToken } from "../lib/memories-base-url.ts";
import {
  emitNetworkEvent,
  installNetworkEventsPlugin,
  type NetworkEventsPlugin,
  networkEventId,
} from "../pool/network/index.ts";
import { getNetworkSessionContext } from "../pool/observability/network-log.ts";
import { loadHarnessIdentity, resolveIdentitySecretFromEnv } from "../pool/identity-wrap-key.ts";
import { AgentStore, HarnessPoolInbox, ManagedAgentPool } from "../pool/index.ts";
import {
  mintKhoraInviteTokens,
  resolveKhoraAdminTokenFromEnv,
} from "../pool/khora-admin-invites.ts";
import { PerAgentInviteBank } from "../pool/per-agent-invite-bank.ts";
import type { PoolAgentRegistry } from "../pool/store.ts";
import { harnessMemoriesFetch } from "../agent/memories/tools/_helpers/memories-client.ts";
import { createRemoteHarnessChat, type HarnessChat } from "../agent/social/message/chat.ts";
import {
  createHarnessAgentApi,
  harnessAgentsDataDir,
  type NetworkHarnessAgentApi,
  type NetworkHarnessCore,
} from "./harness-agents.ts";

export type { AgentMemoriesClient } from "../agent/memories-types.ts";
export type {
  BindNetworkSessionInput,
  EnsureHarnessAgentRegisteredInput,
  HarnessAgentWorkflowDeps,
  NetworkHarnessAgentApi,
  RegisterHarnessAgentInput,
  ResolveHarnessAgentWorkflowDepsOpts,
  SpawnWithMemoriesOptions,
} from "./harness-agents.ts";
export { harnessAgentsDataDir, spawnWithMemories } from "./harness-agents.ts";

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
    fetch: harnessMemoriesFetch(),
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
