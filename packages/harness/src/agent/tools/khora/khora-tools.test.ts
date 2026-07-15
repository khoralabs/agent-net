import { beforeEach, describe, expect, test } from "bun:test";
import type { ToolRuntimeContext, ToolSpec } from "@khoralabs/agent-capabilities";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type {
  AuthorSubscriptionsSnapshot,
  KhoraClient,
  KhoraPost,
  KhoraProfile,
  KhoraSearchResponse,
  PublicProfileResult,
} from "@khoralabs/khora-client";

import { harnessToolkit } from "../_toolkit.ts";
import { createEphemeralRecentNamespacesTracker } from "../memories/_helpers/recent-namespaces.ts";
import type { HarnessToolkitEnv } from "../types.ts";

type KhoraToolName = "searchNetwork" | "createPost" | "lookupProfile" | "updateProfile";

type MockKhoraClient = {
  search: (params: {
    q: string;
    topK?: number;
    neighbors?: boolean;
    maxNeighbors?: number;
    namespace?: string;
  }) => Promise<KhoraSearchResponse>;
  createPost: (body: unknown) => Promise<KhoraPost>;
  updateProfile: (patch: unknown) => Promise<KhoraProfile>;
  lookupProfileByUsername: (username: string) => Promise<PublicProfileResult | null>;
  lookupProfileByDid: (did: string) => Promise<PublicProfileResult | null>;
  getPost: (id: string) => Promise<KhoraPost>;
  updatePost: (id: string, patch: unknown) => Promise<KhoraPost>;
  deletePost: (id: string) => Promise<void>;
  createSubscription: (body: unknown) => Promise<KhoraPost>;
  listAuthorSubscriptions: () => Promise<AuthorSubscriptionsSnapshot>;
};

function createEnv(overrides: Partial<HarnessToolkitEnv> = {}): HarnessToolkitEnv {
  return {
    skills: [],
    activatedSkillNames: new Set(),
    embeddingCache: new Map(),
    recentNamespaces: createEphemeralRecentNamespacesTracker(),
    ...overrides,
  };
}

function createMockKhoraClient(overrides: Partial<MockKhoraClient> = {}): MockKhoraClient {
  return {
    search: async () => ({ hits: [] }),
    createPost: async () =>
      ({
        id: "atp0:post-1",
        kind: "post",
        body: "hello",
        authorSignature: "sig",
        visibility: "public",
      }) as KhoraPost,
    updateProfile: async (patch) =>
      ({
        id: "profile-1",
        username: "agent",
        ...(patch as object),
      }) as KhoraProfile,
    lookupProfileByUsername: async () => null,
    lookupProfileByDid: async () => null,
    getPost: async () =>
      ({
        id: "atp0:post-1",
        kind: "post",
        body: "hello",
        authorSignature: "sig",
        visibility: "public",
      }) as KhoraPost,
    updatePost: async (id) =>
      ({
        id,
        kind: "post",
        body: "updated",
        authorSignature: "sig",
        visibility: "public",
      }) as KhoraPost,
    deletePost: async () => undefined,
    createSubscription: async () =>
      ({
        id: "atp0:sub-1",
        kind: "subscription",
        search: { content: { text: "topic" } },
        authorSignature: "sig",
        visibility: "public",
      }) as KhoraPost,
    listAuthorSubscriptions: async () => ({ subscriptions: [] }),
    ...overrides,
  };
}

describe("harness khora tools", () => {
  let env: HarnessToolkitEnv;
  let mockClient: MockKhoraClient;

  beforeEach(() => {
    mockClient = createMockKhoraClient();
    env = createEnv({
      khoraClient: mockClient as unknown as KhoraClient,
    });
  });

  async function toolHandler(name: KhoraToolName) {
    const { tools } = await evaluateComposable(harnessToolkit, { env });
    const spec = (tools as Partial<Record<KhoraToolName, ToolSpec>>)[name];
    if (spec === undefined) throw new Error(`tool not available: ${name}`);
    return spec.handler.bind(spec) as (
      ctx: ToolRuntimeContext<HarnessToolkitEnv>,
      input: unknown,
    ) => Promise<unknown>;
  }

  test("khora tools are hidden when khora client is not configured", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv(),
    });
    const typed = tools as Partial<Record<KhoraToolName, ToolSpec>>;
    expect(typed.searchNetwork).toBeUndefined();
    expect(typed.createPost).toBeUndefined();
    expect(typed.lookupProfile).toBeUndefined();
  });

  test("searchNetwork calls client.search with query params", async () => {
    let captured: unknown;
    mockClient.search = async (params) => {
      captured = params;
      return { hits: [{ score: 1 }] };
    };

    const searchNetwork = await toolHandler("searchNetwork");
    const result = (await searchNetwork(
      { env, agentId: "agent", agentName: "Agent" },
      { q: "climate tech", topK: 5, neighbors: true },
    )) as KhoraSearchResponse;

    expect(captured).toEqual({ q: "climate tech", topK: 5, neighbors: true });
    expect(result.hits).toHaveLength(1);
  });

  test("createPost publishes content via client.createPost", async () => {
    let captured: unknown;
    mockClient.createPost = async (body) => {
      captured = body;
      return {
        id: "atp0:new",
        kind: "post",
        body: "Ship it.",
        authorSignature: "sig",
        visibility: "public",
      } as KhoraPost;
    };

    const createPost = await toolHandler("createPost");
    const result = (await createPost(
      { env, agentId: "agent", agentName: "Agent" },
      { body: "Ship it.", topics: ["harness"] },
    )) as { post: KhoraPost };

    expect(captured).toMatchObject({
      kind: "post",
      body: "Ship it.",
      topics: ["harness"],
    });
    expect(result.post.id).toBe("atp0:new");
  });

  test("lookupProfile resolves by username", async () => {
    mockClient.lookupProfileByUsername = async (username) =>
      ({
        profile: { id: "p1", username, displayName: "Ada" },
        did: "did:key:ada",
      }) as PublicProfileResult;

    const lookupProfile = await toolHandler("lookupProfile");
    const result = (await lookupProfile(
      { env, agentId: "agent", agentName: "Agent" },
      { lookupBy: "username", username: "ada" },
    )) as { profile: PublicProfileResult | null };

    expect(result.profile?.profile.username).toBe("ada");
  });

  test("updateProfile patches the agent profile", async () => {
    let captured: unknown;
    mockClient.updateProfile = async (patch) => {
      captured = patch;
      return {
        id: "p1",
        username: "agent",
        displayName: "Harness Agent",
      } as KhoraProfile;
    };

    const updateProfile = await toolHandler("updateProfile");
    const result = (await updateProfile(
      { env, agentId: "agent", agentName: "Agent" },
      { displayName: "Harness Agent" },
    )) as { profile: KhoraProfile };

    expect(captured).toEqual({ displayName: "Harness Agent" });
    expect(result.profile.displayName).toBe("Harness Agent");
  });
});
