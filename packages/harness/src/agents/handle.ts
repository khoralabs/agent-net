import type { PersistableSigner } from "@khoralabs/did-key-identity";
import { KhoraClient } from "@khoralabs/khora-client";
import type {
  ChainInitResponse,
  ChainStateResponse,
  VellumChainRow,
} from "@khoralabs/vellum-client";
import { VellumClient, type VellumClientOptions } from "@khoralabs/vellum-client";

import type { AgentChatClient } from "../chat.ts";
import type { AgentMemoriesClient } from "./memories-types.ts";

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

/**
 * Integration-layer handle for one harness agent: Khora client,
 * Vellum channel ops, and (after {@link bindServices}) memories + chat.
 *
 * Inbox traffic goes through the harness multiplex ({@link HarnessPoolInbox} /
 * `harness.subscribeInbox`), not a per-agent WebSocket on this handle.
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
}
