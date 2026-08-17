/**
 * Harness helpers for {@link VellumPool} attachments and e2e chain open.
 *
 * **Temporary** — {@link openVellumChain} binds the responder before the initiator
 * so roster snapshots include the peer (TODO(vellum)). Remove ordering constraint
 * when vellum-client trusts `peer_identity_key` or refreshes roster on cache miss.
 */
import type { IdentitySecret, PersistableSigner } from "@khoralabs/did-key-identity";
import { RelayClient } from "@khoralabs/relay/client";
import { VellumPool } from "@khoralabs/vellum-client/pool";

import type { AgentHandle, VellumHandle } from "../agents/index.ts";
import { AgentStore } from "../agents/index.ts";
import { loadHarnessIdentity, resolveIdentitySecretFromEnv } from "./identity-wrap-key.ts";
import { waitFor } from "./wait-for.ts";

export type VellumPairOptions = {
  /** Base URL of the relay server. */
  relayBaseUrl: string;
  /** Directory under which agent key files are stored (ManagedAgentPool convention). */
  agentsDataDir: string;
  /**
   * Root for {@link VellumPool} attachment dirs:
   * `{vellumDataDir}/{encodeURIComponent(did)}/{encodeURIComponent(channelId)}`.
   */
  vellumDataDir: string;
  /** @deprecated Labels are unused; pool dirs are keyed by DID. */
  initiatorLabel?: string;
  /** @deprecated Labels are unused; pool dirs are keyed by DID. */
  responderLabel?: string;
  /** Optional wrap secret for sealed identity files. */
  identitySecret?: IdentitySecret;
  /** When set, skip binding the peer if they are not on this host. Default: both local. */
  isOnHost?: (did: string) => boolean;
};

export type HarnessVellumPoolOptions = {
  relayBaseUrl: string;
  dataDirRoot: string;
  isOnHost?: (did: string) => boolean;
};

export function createHarnessVellumPool(opts: HarnessVellumPoolOptions): VellumPool {
  return new VellumPool({
    relayBaseUrl: opts.relayBaseUrl,
    dataDirRoot: opts.dataDirRoot,
  });
}

export function wrapPoolClient(pool: VellumPool, did: string, channelId: string): VellumHandle {
  const ref = { did, channelId };
  const client = () => pool.handle(ref);
  return {
    connect: async () => "already-running",
    disconnect: () => {
      void pool.unbind(ref);
    },
    chainCreate: (i) => client().chainCreate(i),
    chainRelease: (s) => client().chainRelease(s),
    sendTurn: (s, b) => client().sendTurn(s, b),
    getChainSnapshot: () => client().getChainSnapshot(),
    listChains: () => client().listChainsFromStore(),
  };
}

async function resolveAgentSigner(
  agent: AgentHandle,
  agentsDataDir: string,
  identitySecret: IdentitySecret | undefined,
): Promise<PersistableSigner> {
  if (agent.signer !== undefined) return agent.signer;
  const keyPath = AgentStore.keyPath(agentsDataDir, agent.did);
  const loaded = await loadHarnessIdentity(keyPath, identitySecret);
  if (!loaded) throw new Error(`failed to load agent signer for ${agent.did}`);
  return loaded;
}

/**
 * Establish a Vellum channel between two agents and open an OBP chain.
 * Binds each local party on a {@link VellumPool} (own sqlite per DID).
 */
export async function openVellumChain(
  initiator: AgentHandle,
  responder: AgentHandle,
  opts: VellumPairOptions,
): Promise<{
  initiatorVellum: VellumHandle;
  responderVellum: VellumHandle;
  channelId: string;
  sessionId: string;
  pool: VellumPool;
}> {
  const identitySecret = opts.identitySecret ?? resolveIdentitySecretFromEnv();
  const initiatorSigner = await resolveAgentSigner(initiator, opts.agentsDataDir, identitySecret);
  const isOnHost = opts.isOnHost ?? (() => true);
  const bindResponder = isOnHost(responder.did);

  const initiatorRelay = new RelayClient({
    relayBaseUrl: opts.relayBaseUrl,
    signer: initiatorSigner,
  });
  const { channelId, inviteToken } = await initiatorRelay.createChannel({});

  const pool = createHarnessVellumPool({
    relayBaseUrl: opts.relayBaseUrl,
    dataDirRoot: opts.vellumDataDir,
    isOnHost,
  });

  try {
    // TODO(vellum): workaround for one-shot roster sync on attach.
    // Bind responder before initiator so the initiator's getRoster snapshot
    // includes the peer. Remove this order constraint once @khoralabs/vellum-client
    // remediates: /chain/init should trust init.peer_identity_key (already sent)
    // or re-sync roster on a local cache miss. Off-host peers still need that fix.
    if (bindResponder) {
      const responderSigner = await resolveAgentSigner(
        responder,
        opts.agentsDataDir,
        identitySecret,
      );
      const responderRelay = new RelayClient({
        relayBaseUrl: opts.relayBaseUrl,
        signer: responderSigner,
      });
      if (inviteToken) await responderRelay.joinChannel({ inviteToken });
      await pool.bind({ signer: responderSigner, channelId });
    }

    await pool.bind({ signer: initiatorSigner, channelId });

    const initiatorVellum = wrapPoolClient(pool, initiator.did, channelId);
    const chainResp = await initiatorVellum.chainCreate({ counterpartyDid: responder.did });
    if (!chainResp.ok) throw new Error("chainCreate failed");
    const sessionId = chainResp.session_id;

    if (bindResponder) {
      const responderVellum = wrapPoolClient(pool, responder.did, channelId);
      await waitFor(
        async () => {
          const snap = await responderVellum.getChainSnapshot().catch(() => null);
          return snap?.chains.some((c) => c.session_id === sessionId) ?? false;
        },
        { timeoutMs: 20_000, pollMs: 500, label: "responder sees chain" },
      );
      return {
        initiatorVellum,
        responderVellum,
        channelId,
        sessionId,
        pool,
      };
    }

    return {
      initiatorVellum,
      responderVellum: wrapPoolClient(pool, responder.did, channelId),
      channelId,
      sessionId,
      pool,
    };
  } catch (err) {
    pool.close();
    throw err;
  }
}

export function disconnectVellum(...handles: VellumHandle[]): void {
  for (const h of handles) h.disconnect();
}
