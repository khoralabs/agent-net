import path from "node:path";
import type { IdentitySecret, PersistableSigner } from "@khoralabs/did-key-identity";
import { RelayClient } from "@khoralabs/relay/client";
import { VellumClient } from "@khoralabs/vellum-client";
import {
  openVellumAttachment,
  type VellumAttachmentHandle,
} from "@khoralabs/vellum-client/session";

import type { AgentHandle, VellumHandle } from "../agents/index.ts";
import { AgentStore } from "../agents/index.ts";
import { loadHarnessIdentity, resolveIdentitySecretFromEnv } from "./identity-wrap-key.ts";
import { waitFor } from "./wait-for.ts";

export type VellumPairOptions = {
  /** Base URL of the relay server. */
  relayBaseUrl: string;
  /** Directory under which agent key files are stored (ManagedAgentPool convention). */
  agentsDataDir: string;
  /** Root dir for vellum session data (channel sqlite, control files). */
  vellumDataDir: string;
  /** Label used to namespace each agent's vellum dir, e.g. "alice" / "bob". */
  initiatorLabel: string;
  responderLabel: string;
  /** Optional wrap secret for sealed identity files. */
  identitySecret?: IdentitySecret;
};

function wrapAttachmentClient(c: VellumClient, att: VellumAttachmentHandle): VellumHandle {
  return {
    connect: async () => "already-running",
    disconnect: () => {
      att.close();
    },
    chainCreate: (i) => c.chainCreate(i),
    chainRelease: (s) => c.chainRelease(s),
    sendTurn: (s, b) => c.sendTurn(s, b),
    getChainSnapshot: () => c.getChainSnapshot(),
    listChains: () => c.listChainsFromStore(),
  };
}

async function resolveAgentSigner(
  agent: AgentHandle,
  agentsDataDir: string,
  identitySecret: IdentitySecret | undefined,
): Promise<PersistableSigner> {
  // Prefer the already-unlocked in-memory signer from the pool.
  if (agent.signer !== undefined) return agent.signer;
  const keyPath = AgentStore.keyPath(agentsDataDir, agent.did);
  const loaded = await loadHarnessIdentity(keyPath, identitySecret);
  if (!loaded) throw new Error(`failed to load agent signer for ${agent.did}`);
  return loaded;
}

/**
 * Establish a Vellum channel between two agents and open an OBP chain.
 * Returns handles so callers can send turns or assert graph state.
 *
 * Uses in-process attachments (`openVellumAttachment`) with unlocked signers —
 * no daemon spawn and no plaintext session key materialization.
 *
 * In production, an agent would evaluate the peer's intent against its own
 * mandate before creating a channel or accepting a chain.
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
}> {
  const identitySecret = opts.identitySecret ?? resolveIdentitySecretFromEnv();
  const initiatorSigner = await resolveAgentSigner(initiator, opts.agentsDataDir, identitySecret);
  const responderSigner = await resolveAgentSigner(responder, opts.agentsDataDir, identitySecret);

  const initiatorRelay = new RelayClient({
    relayBaseUrl: opts.relayBaseUrl,
    signer: initiatorSigner,
  });
  const responderRelay = new RelayClient({
    relayBaseUrl: opts.relayBaseUrl,
    signer: responderSigner,
  });

  const { channelId, inviteToken } = await initiatorRelay.createChannel({});
  if (inviteToken) await responderRelay.joinChannel({ inviteToken });

  const initiatorDataDir = path.join(opts.vellumDataDir, opts.initiatorLabel);
  const responderDataDir = path.join(opts.vellumDataDir, opts.responderLabel);

  const initiatorAtt = openVellumAttachment({
    relayBaseUrl: opts.relayBaseUrl,
    signer: initiatorSigner,
    channelId,
    cfg: { dataDir: initiatorDataDir },
  });
  const responderAtt = openVellumAttachment({
    relayBaseUrl: opts.relayBaseUrl,
    signer: responderSigner,
    channelId,
    cfg: { dataDir: responderDataDir },
  });

  try {
    await Promise.all([initiatorAtt.ready, responderAtt.ready]);
  } catch (err) {
    initiatorAtt.close();
    responderAtt.close();
    throw err;
  }

  const initiatorVellum = wrapAttachmentClient(
    new VellumClient({
      channelId,
      relayBaseUrl: opts.relayBaseUrl,
      dataDir: initiatorDataDir,
      signer: initiatorSigner,
      controlTransport: initiatorAtt.controlTransport,
    }),
    initiatorAtt,
  );
  const responderVellum = wrapAttachmentClient(
    new VellumClient({
      channelId,
      relayBaseUrl: opts.relayBaseUrl,
      dataDir: responderDataDir,
      signer: responderSigner,
      controlTransport: responderAtt.controlTransport,
    }),
    responderAtt,
  );

  const chainResp = await initiatorVellum.chainCreate({ counterpartyDid: responder.did });
  if (!chainResp.ok) throw new Error("chainCreate failed");
  const sessionId = chainResp.session_id;

  await waitFor(
    async () => {
      const snap = await responderVellum.getChainSnapshot().catch(() => null);
      return snap?.chains.some((c) => c.session_id === sessionId) ?? false;
    },
    { timeoutMs: 20_000, pollMs: 500, label: "responder sees chain" },
  );

  return { initiatorVellum, responderVellum, channelId, sessionId };
}

export function disconnectVellum(...handles: VellumHandle[]): void {
  for (const h of handles) h.disconnect();
}
