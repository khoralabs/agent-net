/**
 * Vellum channel/chain session registry for NBC (open channel, delayed genesis, turns).
 *
 * **Temporary workarounds in this module:**
 * - `open` binds channel only (`sessionId: ""`); real genesis via {@link initChain}
 *   / {@link commitTurn} when the initiator has an expose — until Vellum supports
 *   optional genesis separate from channel create.
 * - Post-`chainCreate` poll until responder replica sees the session id.
 */
import type { PersistableSigner } from "@khoralabs/did-key-identity";
import { RelayClient } from "@khoralabs/relay/client";
import type { VellumPool } from "@khoralabs/vellum-client/pool";

import type { AgentHandle, VellumHandle } from "../agents/index.ts";
import { createHarnessVellumPool, type VellumPairOptions, wrapPoolClient } from "./vellum.ts";
import { vellumPoolAttachmentDataDir } from "./vellum-pool-paths.ts";
import { waitFor } from "./wait-for.ts";

export type VellumChainLiveSession = {
  chainId: string;
  channelId: string;
  sessionId: string;
  initiatorDid: string;
  counterpartyDid: string;
  dataDirRoot: string;
};

export const NBC_GENESIS_NOT_INITIATOR = "Only the initiator can post genesis";

export type CommitTurnResult = {
  sessionId: string;
  /** true when this commit ran chainCreate (genesis). */
  genesis: boolean;
};

export type CreateVellumChainSessionRegistryOptions = {
  relayBaseUrl?: string;
  dataDirRoot?: string;
  isOnHost?: (did: string) => boolean;
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
  initChain(chainId: string, genesisTurn: Record<string, unknown>): Promise<{ sessionId: string }>;
  commitTurn(
    chainId: string,
    input: { asDid: string; body: Record<string, unknown> },
  ): Promise<CommitTurnResult>;
  get(chainId: string): VellumChainLiveSession | null;
  list(): readonly VellumChainLiveSession[];
  handleForDid(
    chainId: string,
    initiatorDid: string,
    counterpartyDid: string,
    asDid: string,
  ): VellumHandle | null;
  dataDirForDid(chainId: string, did: string): string | null;
  pool(): VellumPool | null;
  disconnect(chainId: string): void;
  /** Test helper: unbind all live chains and close the pool. */
  clearForTests(): void;
  /** Test helper: register a live chain without opening a relay channel. */
  seedLiveForTests(
    live: VellumChainLiveSession,
    handles?: Partial<Record<string, VellumHandle>>,
  ): void;
};

/**
 * Process-wide Vellum attachment pool plus host chainId → (channelId, parties) map.
 */
export function createVellumChainSessionRegistry(
  opts: CreateVellumChainSessionRegistryOptions = {},
): VellumChainSessionRegistry {
  const liveByChainId = new Map<string, VellumChainLiveSession>();
  const testHandles = new Map<string, VellumHandle>();
  let pool: VellumPool | null = null;
  let dataDirRoot = opts.dataDirRoot?.trim() ?? "";
  let relayBaseUrl = opts.relayBaseUrl?.trim() ?? "";
  const isOnHost = opts.isOnHost ?? (() => true);

  function testHandleKey(chainId: string, did: string): string {
    return `${chainId}\0${did}`;
  }

  function ensurePool(openOpts: VellumPairOptions): VellumPool {
    if (pool !== null) return pool;
    relayBaseUrl = relayBaseUrl || openOpts.relayBaseUrl;
    dataDirRoot = dataDirRoot || openOpts.vellumDataDir;
    pool = createHarnessVellumPool({
      relayBaseUrl,
      dataDirRoot,
      isOnHost,
    });
    return pool;
  }

  return {
    async open(input) {
      const p = ensurePool(input.options);
      const initiatorSigner = input.initiator.signer;
      if (initiatorSigner === undefined) {
        throw new Error(`open: initiator ${input.initiator.did} has no signer`);
      }
      const bindResponder = isOnHost(input.responder.did);

      const initiatorRelay = new RelayClient({
        relayBaseUrl: relayBaseUrl || input.options.relayBaseUrl,
        signer: initiatorSigner,
      });
      const { channelId, inviteToken } = await initiatorRelay.createChannel({});

      await p.bind({ signer: initiatorSigner, channelId });

      if (bindResponder) {
        const responderSigner = input.responder.signer as PersistableSigner | undefined;
        if (responderSigner === undefined) {
          throw new Error(`open: responder ${input.responder.did} has no signer`);
        }
        const responderRelay = new RelayClient({
          relayBaseUrl: relayBaseUrl || input.options.relayBaseUrl,
          signer: responderSigner,
        });
        if (inviteToken) await responderRelay.joinChannel({ inviteToken });
        await p.bind({ signer: responderSigner, channelId });
      }

      const live: VellumChainLiveSession = {
        chainId: input.chainId,
        channelId,
        sessionId: "",
        initiatorDid: input.initiator.did,
        counterpartyDid: input.responder.did,
        dataDirRoot: dataDirRoot || input.options.vellumDataDir,
      };
      liveByChainId.set(input.chainId, live);
      return { channelId, sessionId: "", live };
    },

    async initChain(chainId, genesisTurn) {
      const live = liveByChainId.get(chainId);
      if (live === undefined) {
        throw new Error(`initChain: no live session for ${chainId}`);
      }
      if (live.sessionId.length > 0) {
        throw new Error(`initChain: chain ${chainId} already initialized`);
      }
      const initiatorHandle =
        testHandles.get(testHandleKey(chainId, live.initiatorDid)) ??
        (pool !== null ? wrapPoolClient(pool, live.initiatorDid, live.channelId) : null);
      if (initiatorHandle === null) {
        throw new Error(`initChain: no initiator handle for ${chainId}`);
      }
      const chainResp = await initiatorHandle.chainCreate({
        counterpartyDid: live.counterpartyDid,
        genesisTurn,
      });
      if (!chainResp.ok) throw new Error("chainCreate failed");
      const sessionId = chainResp.session_id;
      live.sessionId = sessionId;

      if (isOnHost(live.counterpartyDid)) {
        const responderHandle =
          testHandles.get(testHandleKey(chainId, live.counterpartyDid)) ??
          (pool !== null ? wrapPoolClient(pool, live.counterpartyDid, live.channelId) : null);
        if (responderHandle !== null) {
          await waitFor(
            async () => {
              const snap = await responderHandle.getChainSnapshot().catch(() => null);
              return snap?.chains.some((c) => c.session_id === sessionId) ?? false;
            },
            { timeoutMs: 20_000, pollMs: 500, label: "responder sees chain" },
          );
        }
      }

      return { sessionId };
    },

    async commitTurn(chainId, input) {
      const live = liveByChainId.get(chainId);
      if (live === undefined) {
        throw new Error(`commitTurn: no live session for ${chainId}`);
      }
      if (live.sessionId.length === 0) {
        if (input.asDid !== live.initiatorDid) {
          throw new Error(NBC_GENESIS_NOT_INITIATOR);
        }
        const inited = await this.initChain(chainId, input.body);
        return { sessionId: inited.sessionId, genesis: true };
      }
      const handle = this.handleForDid(
        chainId,
        live.initiatorDid,
        live.counterpartyDid,
        input.asDid,
      );
      if (handle === null) {
        throw new Error(`commitTurn: no Vellum handle for ${input.asDid}`);
      }
      await handle.sendTurn(live.sessionId, input.body);
      return { sessionId: live.sessionId, genesis: false };
    },

    get(chainId) {
      return liveByChainId.get(chainId) ?? null;
    },

    list() {
      return [...liveByChainId.values()];
    },

    handleForDid(chainId, initiatorDid, counterpartyDid, asDid) {
      const live = liveByChainId.get(chainId);
      if (live === undefined) return null;
      if (asDid !== initiatorDid && asDid !== counterpartyDid) return null;
      const seeded = testHandles.get(testHandleKey(chainId, asDid));
      if (seeded !== undefined) return seeded;
      if (pool === null) return null;
      try {
        return wrapPoolClient(pool, asDid, live.channelId);
      } catch {
        return null;
      }
    },

    dataDirForDid(chainId, did) {
      const live = liveByChainId.get(chainId);
      if (live === undefined) return null;
      return vellumPoolAttachmentDataDir(live.dataDirRoot, did, live.channelId);
    },

    pool() {
      return pool;
    },

    disconnect(chainId) {
      const live = liveByChainId.get(chainId);
      if (live === undefined) return;
      if (pool !== null) {
        void pool.unbind({ did: live.initiatorDid, channelId: live.channelId });
        void pool.unbind({ did: live.counterpartyDid, channelId: live.channelId });
      }
      liveByChainId.delete(chainId);
    },

    clearForTests() {
      if (pool !== null) {
        try {
          pool.close();
        } catch {
          /* ignore */
        }
      }
      pool = null;
      liveByChainId.clear();
      testHandles.clear();
    },

    seedLiveForTests(live, handles) {
      liveByChainId.set(live.chainId, live);
      if (handles === undefined) return;
      for (const [did, handle] of Object.entries(handles)) {
        if (handle !== undefined) {
          testHandles.set(testHandleKey(live.chainId, did), handle);
        }
      }
    },
  };
}
