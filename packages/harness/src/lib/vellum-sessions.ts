import path from "node:path";

import type { AgentHandle, VellumHandle } from "../agents/index.ts";
import { disconnectVellum, openVellumChain, type VellumPairOptions } from "./vellum.ts";

export type VellumChainLiveSession = {
  initiatorVellum: VellumHandle;
  responderVellum: VellumHandle;
  initiatorDataDir: string;
  channelId: string;
  sessionId: string;
};

export type VellumChainSessionRegistry = {
  open(input: {
    chainId: string;
    initiator: AgentHandle;
    responder: AgentHandle;
    options: VellumPairOptions;
  }): Promise<{
    channelId: string;
    sessionId: string;
    live: VellumChainLiveSession;
  }>;
  get(chainId: string): VellumChainLiveSession | null;
  handleForDid(
    chainId: string,
    initiatorDid: string,
    counterpartyDid: string,
    asDid: string,
  ): VellumHandle | null;
  disconnect(chainId: string): void;
  /** Test helper: disconnect all live sessions and clear the map. */
  clearForTests(): void;
};

/**
 * In-memory registry of live Vellum/OBP chain sessions for a host process.
 */
export function createVellumChainSessionRegistry(): VellumChainSessionRegistry {
  const liveByChainId = new Map<string, VellumChainLiveSession>();

  return {
    async open(input) {
      const opened = await openVellumChain(input.initiator, input.responder, input.options);
      const live: VellumChainLiveSession = {
        initiatorVellum: opened.initiatorVellum,
        responderVellum: opened.responderVellum,
        initiatorDataDir: path.join(input.options.vellumDataDir, input.options.initiatorLabel),
        channelId: opened.channelId,
        sessionId: opened.sessionId,
      };
      liveByChainId.set(input.chainId, live);
      return {
        channelId: opened.channelId,
        sessionId: opened.sessionId,
        live,
      };
    },

    get(chainId) {
      return liveByChainId.get(chainId) ?? null;
    },

    handleForDid(chainId, initiatorDid, counterpartyDid, asDid) {
      const live = liveByChainId.get(chainId);
      if (live === undefined) return null;
      if (asDid === initiatorDid) return live.initiatorVellum;
      if (asDid === counterpartyDid) return live.responderVellum;
      return null;
    },

    disconnect(chainId) {
      const live = liveByChainId.get(chainId);
      if (live === undefined) return;
      disconnectVellum(live.initiatorVellum, live.responderVellum);
      liveByChainId.delete(chainId);
    },

    clearForTests() {
      for (const live of liveByChainId.values()) {
        try {
          disconnectVellum(live.initiatorVellum, live.responderVellum);
        } catch {
          /* ignore */
        }
      }
      liveByChainId.clear();
    },
  };
}
