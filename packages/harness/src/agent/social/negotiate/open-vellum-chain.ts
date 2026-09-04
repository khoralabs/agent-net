/**
 * Open a Vellum chain session between two DIDs managed by the same pool.
 *
 * Operator hosts that create chains from a DID pair (rather than from an
 * already-focused {@link AgentHandle}) otherwise repeat the same focus-both-then
 * -open sequence at every call site.
 */
import type { AgentHandle } from "../../handle.ts";
import type { VellumPairOptions } from "./vellum.ts";
import type { VellumChainSessionRegistry } from "./vellum-sessions.ts";

/** Just the pool capability this helper needs, so hosts can pass a stub. */
export type VellumChainAgentFocus = {
  focus(did: string): Promise<AgentHandle>;
};

export type OpenVellumChainForDidsInput = {
  chainId: string;
  initiatorDid: string;
  counterpartyDid: string;
  options: VellumPairOptions;
};

export type OpenedVellumChain = {
  channelId: string;
  sessionId: string;
};

/** Focus both parties, then open the chain session between them. */
export async function openVellumChainForDids(
  pool: VellumChainAgentFocus,
  sessions: Pick<VellumChainSessionRegistry, "open">,
  input: OpenVellumChainForDidsInput,
): Promise<OpenedVellumChain> {
  const initiator = await pool.focus(input.initiatorDid);
  const responder = await pool.focus(input.counterpartyDid);
  const opened = await sessions.open({
    chainId: input.chainId,
    initiator,
    responder,
    options: input.options,
  });
  return { channelId: opened.channelId, sessionId: opened.sessionId };
}
