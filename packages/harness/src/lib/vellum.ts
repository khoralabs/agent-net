import path from "node:path";
import { loadIdentity } from "@khoralabs/did-key-identity";
import { RelayClient } from "@khoralabs/relay-client";

import type { AgentHandle, VellumHandle } from "../agents";
import { AgentStore } from "../agents";
import { waitFor } from "./wait-for";

export type VellumPairOptions = {
  /** Base URL of the relay server. */
  relayBaseUrl: string;
  /** Directory under which agent key files are stored (ManagedAgentPool convention). */
  agentsDataDir: string;
  /** Root dir for vellum daemon data (channel sqlite, control files). */
  vellumDataDir: string;
  /** Label used to namespace each agent's vellum dir, e.g. "alice" / "bob". */
  initiatorLabel: string;
  responderLabel: string;
};

/**
 * Establish a Vellum channel between two agents and open an OBP chain.
 * Returns handles so callers can send turns or assert graph state.
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
  const initiatorKeyPath = AgentStore.keyPath(opts.agentsDataDir, initiator.did);
  const responderKeyPath = AgentStore.keyPath(opts.agentsDataDir, responder.did);

  const initiatorSigner = await loadIdentity(initiatorKeyPath);
  const responderSigner = await loadIdentity(responderKeyPath);
  if (!initiatorSigner || !responderSigner) throw new Error("failed to load agent signers");

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

  const initiatorVellum = initiator.vellum(channelId, {
    relayBaseUrl: opts.relayBaseUrl,
    dataDir: path.join(opts.vellumDataDir, opts.initiatorLabel),
  });
  const responderVellum = responder.vellum(channelId, {
    relayBaseUrl: opts.relayBaseUrl,
    dataDir: path.join(opts.vellumDataDir, opts.responderLabel),
  });

  await Promise.all([initiatorVellum.connect(), responderVellum.connect()]);

  // Allow daemons to publish KeyPackages and sync the roster before chain creation.
  await Bun.sleep(3_000);

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
