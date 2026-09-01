/**
 * Harness helpers for Vellum pool attachments and e2e chain open.
 * Pool/host wiring comes from `@khoralabs/vellum-client/pool/host`.
 */
import type { IdentitySecret, PersistableSigner } from "@khoralabs/did-key-identity";
import { RelayClient } from "@khoralabs/relay/client";
import { VellumChain } from "@khoralabs/vellum-client";
import type { VellumPool } from "@khoralabs/vellum-client/pool";
import {
  createSharedUplinkVellumPool,
  type SharedUplinkVellumPoolOptions,
  type VellumHandle,
  wrapVellumPoolClient,
} from "@khoralabs/vellum-client/pool/host";

import { waitFor } from "../../../lib/wait-for.ts";
import {
  loadHarnessIdentity,
  resolveIdentitySecretFromEnv,
} from "../../../pool/identity-wrap-key.ts";
import { AgentStore } from "../../../pool/index.ts";
import type { AgentActor } from "../../actor.ts";

export type { SharedUplinkVellumPoolOptions, VellumHandle };
export { createSharedUplinkVellumPool, wrapVellumPoolClient };

/** @deprecated Prefer {@link SharedUplinkVellumPoolOptions}. */
export type HarnessVellumPoolOptions = SharedUplinkVellumPoolOptions;

/** Stable harness name for {@link createSharedUplinkVellumPool}. */
export const createHarnessVellumPool = createSharedUplinkVellumPool;

/** Stable harness name for {@link wrapVellumPoolClient}. */
export const wrapPoolClient = wrapVellumPoolClient;

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
  /** Optional wrap secret for sealed identity files. */
  identitySecret?: IdentitySecret;
  /** When set, skip binding the peer if they are not on this host. Default: both local. */
  isOnHost?: (did: string) => boolean;
};

async function resolveAgentSigner(
  agent: AgentActor,
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
  initiator: AgentActor,
  responder: AgentActor,
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
    await pool.bind({ signer: initiatorSigner, channelId });

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

    const initiatorVellum = wrapPoolClient(pool, initiator.did, channelId);
    const chain = await VellumChain.open(pool.handle({ did: initiator.did, channelId }), {
      peer: responder.did,
    });
    const sessionId = chain.sessionId;

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
