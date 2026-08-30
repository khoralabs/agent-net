import type { PersistableSigner } from "@khoralabs/did-key-identity";
import { KhoraClient } from "@khoralabs/khora-client";

import type { AgentActor } from "./actor.ts";
import type { AgentMemoriesClient } from "./memories-types.ts";
import type { AgentChatClient } from "./social/message/chat.ts";
import { AgentSocial } from "./social/social.ts";

export type AgentHandleOptions = {
  signer: PersistableSigner;
  baseUrl: string;
  /** Path to the agent's persisted Ed25519 key file when known by the pool. */
  keyPath?: string;
  /**
   * Optional caller-defined id linking this agent to an external system.
   * Opaque to the harness.
   */
  externalId?: string;
};

export type BindAgentServicesOptions = {
  memories: AgentMemoriesClient;
  chat: AgentChatClient;
  /** Optional invite listing for `social.connect`. */
  listInvites?: () => Promise<string[]>;
};

/**
 * Integration-layer handle for one harness agent: Khora client,
 * social relationship tree, and (after {@link bindServices}) memories.
 *
 * Satisfies {@link AgentActor} for capability modules that must not depend on this facade.
 *
 * Inbox traffic goes through the harness multiplex ({@link HarnessPoolInbox} /
 * `harness.subscribeInbox`), not a per-agent WebSocket on this handle.
 *
 * Vellum/NBC channel ops live under {@link AgentSocial.negotiate}
 * (`agent/social/negotiate`), not on this type.
 */
export class AgentHandle implements AgentActor {
  readonly did: string;
  readonly signer: PersistableSigner;
  readonly baseUrl: string;
  readonly client: KhoraClient;
  /** Optional opaque external linkage id (tenant/org/etc.). */
  readonly externalId: string | undefined;
  #memories: AgentMemoriesClient | undefined;
  #chat: AgentChatClient | undefined;
  #social: AgentSocial | undefined;
  #listInvites: (() => Promise<string[]>) | undefined;

  constructor(opts: AgentHandleOptions) {
    this.did = opts.signer.did;
    this.signer = opts.signer;
    this.baseUrl = opts.baseUrl.trim().replace(/\/$/, "");
    this.client = new KhoraClient({ baseUrl: this.baseUrl, signer: opts.signer });
    const externalId = opts.externalId?.trim();
    this.externalId = externalId !== undefined && externalId.length > 0 ? externalId : undefined;
  }

  get memories(): AgentMemoriesClient {
    if (this.#memories === undefined) {
      throw new Error(
        `Agent ${this.did} has no memories client (spawn via spawnWithMemories / pool.get)`,
      );
    }
    return this.#memories;
  }

  /** @deprecated Prefer {@link social.message}. */
  get chat(): AgentChatClient {
    if (this.#chat === undefined) {
      throw new Error(
        `Agent ${this.did} has no chat client (spawn via spawnWithMemories / pool.get)`,
      );
    }
    return this.#chat;
  }

  get social(): AgentSocial {
    if (this.#social === undefined) {
      throw new Error(
        `Agent ${this.did} has no social services (spawn via spawnWithMemories / pool.get)`,
      );
    }
    return this.#social;
  }

  /** Attach harness memories + chat (+ social tree). */
  bindServices(memories: AgentMemoriesClient, chat: AgentChatClient): this;
  bindServices(opts: BindAgentServicesOptions): this;
  bindServices(
    memoriesOrOpts: AgentMemoriesClient | BindAgentServicesOptions,
    chat?: AgentChatClient,
  ): this {
    if ("memories" in memoriesOrOpts && "chat" in memoriesOrOpts) {
      this.#memories = memoriesOrOpts.memories;
      this.#chat = memoriesOrOpts.chat;
      this.#listInvites = memoriesOrOpts.listInvites;
    } else {
      if (chat === undefined) {
        throw new Error(`Agent ${this.did}: bindServices requires a chat client`);
      }
      this.#memories = memoriesOrOpts;
      this.#chat = chat;
    }
    this.#social = new AgentSocial({
      handle: this,
      chat: this.#chat,
      ...(this.#listInvites !== undefined ? { listInvites: this.#listInvites } : {}),
    });
    return this;
  }
}
