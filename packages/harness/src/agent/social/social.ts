import type {
  BuildSubscriptionSearchInput,
  KhoraClient,
  KhoraPost,
  KhoraPostCreateContent,
  KhoraPostPatch,
  KhoraProfile,
  KhoraProfilePatch,
  KhoraSearchQuery,
  KhoraSearchRequest,
  KhoraSearchResponse,
  KhoraStandingSearchRequest,
  KhoraSubscriptionCreate,
  PublicProfileResult,
} from "@khoralabs/khora-client";
import { buildSubscriptionSearch } from "@khoralabs/khora-client";

import type { AgentActor } from "../actor.ts";
import type { AgentChatClient } from "./message/chat.ts";
import { AgentSocialMessage } from "./message/message.ts";
import { AgentSocialNegotiate } from "./negotiate/negotiate.ts";

export type SocialInvitation = {
  /** Peer DID the invitation targets. */
  peerDid: string;
  /** Invite token when available from the invite bank. */
  token?: string;
  kind: "invitation";
};

export type AgentSocialSubscribeInput = Omit<
  KhoraSubscriptionCreate,
  "kind" | "authorSignature" | "search"
> & {
  search?: KhoraStandingSearchRequest;
  buildSearch?: BuildSubscriptionSearchInput;
};

/**
 * Relationship surface for one agent: fabric (posts incl. subscriptions),
 * nested negotiate (Vellum/NBC), and nested message (chat).
 */
export class AgentSocial {
  readonly #client: KhoraClient;
  readonly negotiate: AgentSocialNegotiate;
  readonly message: AgentSocialMessage;
  #listInvites: (() => Promise<string[]>) | undefined;

  constructor(opts: {
    handle: AgentActor;
    chat: AgentChatClient;
    listInvites?: () => Promise<string[]>;
  }) {
    this.#client = opts.handle.client;
    this.negotiate = new AgentSocialNegotiate(opts.handle);
    this.message = new AgentSocialMessage(opts.chat);
    this.#listInvites = opts.listInvites;
  }

  /**
   * Create a post or subscription. Subscriptions use `kind: "subscription"`
   * (same as Khora `createSubscription` → `createPost`).
   */
  post(body: KhoraPostCreateContent): Promise<KhoraPost> {
    return this.#client.createPost(body);
  }

  /** Create a standing-search subscription using khora search builders when `buildSearch` is set. */
  subscribe(input: AgentSocialSubscribeInput): Promise<KhoraPost> {
    const search =
      input.search ??
      (input.buildSearch !== undefined ? buildSubscriptionSearch(input.buildSearch) : undefined);
    if (search === undefined) {
      throw new Error("social.subscribe: pass search or buildSearch");
    }
    const { buildSearch: _buildSearch, search: _search, ...rest } = input;
    return this.#client.createSubscription({ ...rest, search });
  }

  getPost(id: string): Promise<KhoraPost> {
    return this.#client.getPost(id);
  }

  updatePost(id: string, patch: Omit<KhoraPostPatch, "authorSignature">): Promise<KhoraPost> {
    return this.#client.updatePost(id, patch);
  }

  deletePost(id: string): Promise<void> {
    return this.#client.deletePost(id);
  }

  search(params: KhoraSearchQuery): Promise<KhoraSearchResponse> {
    return this.#client.search(params);
  }

  searchAdvanced(body: KhoraSearchRequest): Promise<KhoraSearchResponse> {
    return this.#client.searchAdvanced(body);
  }

  /**
   * Begin a relationship invite toward `peerDid`.
   * Token comes from the invite bank; validated via `previewInvite` when present.
   */
  async connect(peerDid: string): Promise<SocialInvitation> {
    const did = peerDid.trim();
    if (did.length === 0) {
      throw new Error("social.connect: peerDid is required");
    }
    let token: string | undefined;
    if (this.#listInvites !== undefined) {
      const tokens = await this.#listInvites();
      token = tokens[0];
    }
    if (token !== undefined) {
      await this.#client.previewInvite(token);
    }
    return {
      peerDid: did,
      kind: "invitation",
      ...(token !== undefined ? { token } : {}),
    };
  }

  updateProfile(patch: KhoraProfilePatch): Promise<KhoraProfile> {
    return this.#client.updateProfile(patch);
  }

  lookupProfileByDid(did: string): Promise<PublicProfileResult | null> {
    return this.#client.lookupProfileByDid(did);
  }

  lookupProfileByUsername(username: string): Promise<PublicProfileResult | null> {
    return this.#client.lookupProfileByUsername(username);
  }

  listAuthorSubscriptions() {
    return this.#client.listAuthorSubscriptions();
  }
}
