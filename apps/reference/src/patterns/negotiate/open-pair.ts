import type { AgentActor, AgentHandle } from "@khoralabs/agent-net";
import { disconnectVellum, type VellumHandle } from "@khoralabs/agent-net";

export type OpenPairOptions = {
  relayBaseUrl: string;
  agentsDataDir: string;
  vellumDataDir: string;
};

export type OpenedPair = {
  initiatorDid: string;
  responderDid: string;
  sessionId: string;
  channelId: string;
  initiatorVellum: VellumHandle;
  responderVellum: VellumHandle;
};

export type NegotiateStartFn = (
  initiator: AgentHandle,
  responder: AgentActor,
  options: OpenPairOptions,
) => Promise<{
  sessionId: string;
  channelId: string;
  initiatorVellum: VellumHandle;
  responderVellum: VellumHandle;
}>;

export type NegotiatePairRegistryDeps = {
  disconnect?: (...handles: VellumHandle[]) => void;
  start?: NegotiateStartFn;
};

/**
 * Thin wrap over `social.negotiate.start` with process-exit cleanup registry.
 * Promote candidate for host negotiate helpers.
 */
export function createNegotiatePairRegistry(deps: NegotiatePairRegistryDeps = {}) {
  const disconnect = deps.disconnect ?? disconnectVellum;
  const start: NegotiateStartFn =
    deps.start ??
    ((initiator, responder, options) => initiator.social.negotiate.start(responder, options));
  const opened: OpenedPair[] = [];

  return {
    async open(
      initiator: AgentHandle,
      responder: AgentActor,
      options: OpenPairOptions,
    ): Promise<OpenedPair> {
      const result = await start(initiator, responder, options);
      const pair: OpenedPair = {
        initiatorDid: initiator.did,
        responderDid: responder.did,
        sessionId: result.sessionId,
        channelId: result.channelId,
        initiatorVellum: result.initiatorVellum,
        responderVellum: result.responderVellum,
      };
      opened.push(pair);
      return pair;
    },

    list(): readonly OpenedPair[] {
      return opened;
    },

    /** Disconnect one pair and remove it from the registry. */
    stop(pair: OpenedPair): void {
      const idx = opened.findIndex(
        (p) =>
          p.sessionId === pair.sessionId &&
          p.channelId === pair.channelId &&
          p.initiatorDid === pair.initiatorDid &&
          p.responderDid === pair.responderDid,
      );
      if (idx < 0) return;
      const [removed] = opened.splice(idx, 1);
      if (removed === undefined) return;
      disconnect(removed.initiatorVellum, removed.responderVellum);
    },

    stopAll(): void {
      if (opened.length === 0) return;
      const handles = opened.flatMap((p) => [p.initiatorVellum, p.responderVellum]);
      disconnect(...handles);
      opened.length = 0;
    },
  };
}

export type NegotiatePairRegistry = ReturnType<typeof createNegotiatePairRegistry>;
