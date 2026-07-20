import type { PersistableSigner } from "@khoralabs/did-key-identity";
import {
  isDerivedInboxKindEvent,
  KhoraClient,
  type KhoraClientEvent,
} from "@khoralabs/khora-client";
import type {
  ChainInitResponse,
  ChainStateResponse,
  VellumChainRow,
} from "@khoralabs/vellum-client";
import { VellumClient, type VellumClientOptions } from "@khoralabs/vellum-client";

import type { AgentChatClient } from "../chat";
import type { AgentMemoriesClient } from "./memories-types";

export type AgentHandleOptions = {
  signer: PersistableSigner;
  baseUrl: string;
  /** Path to the agent's persisted Ed25519 key file (for vellum operations). */
  keyPath?: string;
};

export type VellumHandle = {
  connect(options?: {
    webSocketUrl?: string;
    upgradeNonce?: string;
  }): Promise<"spawned" | "already-running">;
  /** Stop the daemon subprocess for this channel. */
  disconnect(): void;
  chainCreate(input: {
    counterpartyDid: string;
    sessionId?: string;
    genesisHash?: string;
    genesisTurn?: Record<string, unknown>;
  }): Promise<ChainInitResponse>;
  chainRelease(sessionId: string): Promise<void>;
  sendTurn(sessionId: string, body: Record<string, unknown>): Promise<void>;
  getChainSnapshot(): Promise<ChainStateResponse>;
  listChains(): VellumChainRow[];
};

export type AgentInboxEventHandler = (event: KhoraClientEvent) => void;

export type AgentInboxLifecycleHandler = (
  event: "connected" | "disconnected" | "connect_failed" | "reconnecting" | "stopped",
  detail?: { error?: string; backoffMs?: number },
) => void;

export type AgentInboxOptions = {
  onEvent: AgentInboxEventHandler;
  onLifecycle?: AgentInboxLifecycleHandler;
};

/** Returned by `AgentHandle.connectInbox`. Call `close()` to tear down. */
export type InboxConnection = {
  close(): void;
};

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Integration-layer handle for one harness agent: Khora client, inbox,
 * Vellum channel ops, and (after {@link bindServices}) memories + chat.
 */
export class AgentHandle {
  readonly did: string;
  readonly signer: PersistableSigner;
  readonly baseUrl: string;
  readonly client: KhoraClient;
  readonly #keyPath: string | undefined;
  #memories: AgentMemoriesClient | undefined;
  #chat: AgentChatClient | undefined;

  constructor(opts: AgentHandleOptions) {
    this.did = opts.signer.did;
    this.signer = opts.signer;
    this.baseUrl = opts.baseUrl.trim().replace(/\/$/, "");
    this.client = new KhoraClient({ baseUrl: this.baseUrl, signer: opts.signer });
    this.#keyPath = opts.keyPath;
  }

  get memories(): AgentMemoriesClient {
    if (this.#memories === undefined) {
      throw new Error(`Agent ${this.did} has no memories client (spawn via spawnWithMemories)`);
    }
    return this.#memories;
  }

  get chat(): AgentChatClient {
    if (this.#chat === undefined) {
      throw new Error(`Agent ${this.did} has no chat client (spawn via spawnWithMemories)`);
    }
    return this.#chat;
  }

  /** Attach harness memories + chat (used by {@link spawnWithMemories}). */
  bindServices(memories: AgentMemoriesClient, chat: AgentChatClient): this {
    this.#memories = memories;
    this.#chat = chat;
    return this;
  }

  /**
   * Create a `VellumHandle` for a specific relay channel. Provides typed
   * access to connect, chainCreate, sendTurn, and read operations.
   */
  vellum(
    channelId: string,
    opts: Pick<VellumClientOptions, "relayBaseUrl" | "dataDir">,
  ): VellumHandle {
    const clientOpts: VellumClientOptions = {
      channelId,
      relayBaseUrl: opts.relayBaseUrl,
      dataDir: opts.dataDir,
      keyPath: this.#keyPath,
    };
    const c = new VellumClient(clientOpts);
    return {
      connect: (o) => c.connect(o),
      disconnect: () => c.disconnect(),
      chainCreate: (i) => c.chainCreate(i),
      chainRelease: (s) => c.chainRelease(s),
      sendTurn: (s, b) => c.sendTurn(s, b),
      getChainSnapshot: () => c.getChainSnapshot(),
      listChains: () => c.listChainsFromStore(),
    };
  }

  /**
   * Open a reconnecting WebSocket inbox connection for this agent.
   * Multiple connections across different handles run independently.
   * Returns an `InboxConnection` whose `close()` stops reconnection and
   * tears down the current session.
   */
  connectInbox(opts: AgentInboxOptions): InboxConnection {
    const { onEvent, onLifecycle } = opts;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    let closed = false;
    let sessionClose: (() => void) | undefined;

    const unsub = this.client.subscribe((event) => {
      if (!event.type.startsWith("inbox:")) return;
      if (isDerivedInboxKindEvent(event)) return;
      onEvent(event);
    });

    void (async () => {
      let backoffMs = MIN_BACKOFF_MS;
      while (!closed) {
        let sessionEnded = false;
        try {
          const handle = await this.client.connectInbox({
            onOpen: () => {
              backoffMs = MIN_BACKOFF_MS;
              onLifecycle?.("connected");
            },
            onClose: () => {
              sessionEnded = true;
              onLifecycle?.("disconnected");
            },
            onError: (err) => {
              sessionEnded = true;
              const error = err instanceof Error ? err.message : String(err);
              onLifecycle?.("connect_failed", { error });
            },
          });
          sessionClose = handle.close;
          while (!closed && !sessionEnded) {
            await sleep(200);
          }
          handle.close();
          sessionClose = undefined;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          onLifecycle?.("connect_failed", { error });
        }
        if (closed) break;
        onLifecycle?.("reconnecting", { backoffMs });
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      }
    })();

    return {
      close() {
        closed = true;
        sessionClose?.();
        unsub();
        onLifecycle?.("stopped");
      },
    };
  }
}
