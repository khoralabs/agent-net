import type {
  BuildSubscriptionSearchInput,
  KhoraClient,
  KhoraPost,
  KhoraPostCreateContent,
  KhoraPostPatch,
  KhoraProfile,
  KhoraProfilePatch,
  KhoraRelationship,
  KhoraRelationshipListResponse,
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
 *
 * Prefer `@khoralabs/agent-net/negotiate` for negotiate-only hosts so the
 * package root need not re-export that graph.
 */
export class AgentSocial {
  readonly #client: KhoraClient;
  readonly negotiate: AgentSocialNegotiate;
  readonly message: AgentSocialMessage;

  constructor(opts: {
    handle: AgentActor;
    chat: AgentChatClient;
  }) {
    this.#client = opts.handle.client;
    this.negotiate = new AgentSocialNegotiate(opts.handle);
    this.message = new AgentSocialMessage(opts.chat);
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

  /** Begin a peer relationship invite toward a registered Khora principal. */
  async connect(peerDid: string): Promise<KhoraRelationship> {
    const did = peerDid.trim();
    if (did.length === 0) {
      throw new Error("social.connect: peerDid is required");
    }
    return (await this.#client.createRelationship({ peerDid: did })).relationship;
  }

  listRelationships(): Promise<KhoraRelationshipListResponse> {
    return this.#client.listRelationships();
  }

  async acceptRelationship(channelId: string): Promise<KhoraRelationship> {
    return (await this.#client.acceptRelationship(channelId)).relationship;
  }

  declineRelationship(channelId: string): Promise<void> {
    return this.#client.declineRelationship(channelId);
  }

  revokeRelationship(channelId: string): Promise<void> {
    return this.#client.revokeRelationship(channelId);
  }

  deleteRelationship(channelId: string): Promise<void> {
    return this.#client.deleteRelationship(channelId);
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
