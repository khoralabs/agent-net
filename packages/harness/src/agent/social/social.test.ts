import { describe, expect, mock, test } from "bun:test";

import type { AgentActor } from "../actor.ts";
import { createBoundAgentMemoriesClient } from "../memories-types.ts";
import type { AgentChatClient } from "./message/chat.ts";
import { AgentSocial } from "./social.ts";

function fakeChat(did: string): AgentChatClient {
  return {
    did,
    createThread: mock(async () => ({ id: "t1" }) as never),
    grantAccess: mock(async () => {}),
    sendMessage: mock(async () => ({}) as never),
    listPosts: mock(async () => ({ posts: [], cursor: undefined }) as never),
    listThreads: mock(async () => ({ threads: [], cursor: undefined }) as never),
    getThread: mock(async () => ({ id: "t1" }) as never),
    listParticipants: mock(async () => []),
    subscribeToThread: mock(async () => () => {}),
  };
}

describe("AgentSocial", () => {
  test("post/search/connect and relationship lifecycle delegate to khora client", async () => {
    const createPost = mock(async (body: unknown) => ({ id: "p1", body }));
    const search = mock(async () => ({ hits: [] }));
    const relationship = {
      channelId: "ch1",
      peerDid: "did:key:peer",
      role: "creator" as const,
      status: "pending" as const,
      createdAtMs: 1,
    };
    const createRelationship = mock(async () => ({ relationship }));
    const listRelationships = mock(async () => ({ relationships: [relationship] }));
    const acceptRelationship = mock(async () => ({
      relationship: { ...relationship, status: "accepted" },
    }));
    const declineRelationship = mock(async () => {});
    const revokeRelationship = mock(async () => {});
    const deleteRelationship = mock(async () => {});
    const client = {
      createPost,
      createSubscription: mock(async (body: unknown) => ({ id: "sub-1", body })),
      search,
      searchAdvanced: mock(async () => ({ hits: [] })),
      getPost: mock(async () => ({})),
      updatePost: mock(async () => ({})),
      deletePost: mock(async () => {}),
      updateProfile: mock(async () => ({})),
      lookupProfileByDid: mock(async () => null),
      lookupProfileByUsername: mock(async () => null),
      listAuthorSubscriptions: mock(async () => ({ subscriptions: [] })),
      createRelationship,
      listRelationships,
      acceptRelationship,
      declineRelationship,
      revokeRelationship,
      deleteRelationship,
      did: "did:key:self",
    };
    const handle = {
      did: "did:key:self",
      client,
    } as unknown as AgentActor;
    const social = new AgentSocial({
      handle,
      chat: fakeChat("did:key:self"),
    });

    await social.post({ kind: "subscription", search: { content: { text: "x" } } });
    expect(createPost).toHaveBeenCalled();

    await social.search({ q: "hello" } as never);
    expect(search).toHaveBeenCalled();

    expect(await social.connect("did:key:peer")).toEqual(relationship);
    expect(createRelationship).toHaveBeenCalledWith({ peerDid: "did:key:peer" });
    expect(await social.listRelationships()).toEqual({ relationships: [relationship] });
    expect((await social.acceptRelationship("ch1")).status).toBe("accepted");
    await social.declineRelationship("ch1");
    await social.revokeRelationship("ch1");
    await social.deleteRelationship("ch1");
    expect(declineRelationship).toHaveBeenCalledWith("ch1");
    expect(revokeRelationship).toHaveBeenCalledWith("ch1");
    expect(deleteRelationship).toHaveBeenCalledWith("ch1");
  });

  test("subscribe uses buildSubscriptionSearch via createSubscription", async () => {
    const createSubscription = mock(async (body: unknown) => ({ id: "sub-1", body }));
    const client = {
      createPost: mock(async () => ({})),
      createSubscription,
      search: mock(async () => ({ hits: [] })),
      searchAdvanced: mock(async () => ({ hits: [] })),
      getPost: mock(async () => ({})),
      updatePost: mock(async () => ({})),
      deletePost: mock(async () => {}),
      updateProfile: mock(async () => ({})),
      lookupProfileByDid: mock(async () => null),
      lookupProfileByUsername: mock(async () => null),
      listAuthorSubscriptions: mock(async () => ({ subscriptions: [] })),
      did: "did:key:self",
    };
    const handle = { did: "did:key:self", client } as unknown as AgentActor;
    const social = new AgentSocial({ handle, chat: fakeChat("did:key:self") });

    await social.subscribe({
      visibility: "public",
      buildSearch: { topicSlug: "buy", queryText: "bearing surplus" },
    });

    expect(createSubscription).toHaveBeenCalled();
    const body = createSubscription.mock.calls[0]?.[0] as {
      search: { content: { text?: string }; options?: { labels?: { some?: string[] } } };
    };
    expect(body.search.content.text).toBe("bearing surplus");
    expect(body.search.options?.labels?.some).toContain("khora_topic:buy");
  });

  test("connect rejects empty peerDid", async () => {
    const handle = {
      did: "did:key:self",
      client: { did: "did:key:self" },
    } as unknown as AgentActor;
    const social = new AgentSocial({ handle, chat: fakeChat("did:key:self") });
    await expect(social.connect("  ")).rejects.toThrow(/peerDid/);
  });

  test("message.thread delegates to chat.createThread", async () => {
    const chat = fakeChat("did:key:self");
    const handle = {
      did: "did:key:self",
      client: { did: "did:key:self" },
    } as unknown as AgentActor;
    const social = new AgentSocial({ handle, chat });
    await social.message.thread({ id: "custom" });
    expect(chat.createThread).toHaveBeenCalledWith({ id: "custom" });
  });
});

describe("createBoundAgentMemoriesClient", () => {
  test("integrate requires lexical or instructions", async () => {
    const memories = createBoundAgentMemoriesClient({
      database: { kind: "account", ownerKey: "did:key:x" },
      ontology: { nodeLabels: { memory: {} }, edgeLabels: {} } as never,
      serviceClient: {} as never,
      client: {} as never,
      readModel: { database: { kind: "account", ownerKey: "did:key:x" } } as never,
    });
    await expect(
      memories.integrate({
        kind: "interaction",
        ownerKey: "did:key:x",
        namespace: "notes",
        correlationId: "c1",
        occurredAtMs: 1,
        payload: {},
        features: { lexical: [], vector: [] },
        instructions: "  ",
      }),
    ).rejects.toThrow(/lexical or instructions/);
  });

  test("exposes the same readModel instance passed in", () => {
    const readModel = {
      database: { kind: "account", ownerKey: "did:key:x" },
    } as never;
    const memories = createBoundAgentMemoriesClient({
      database: { kind: "account", ownerKey: "did:key:x" },
      ontology: { nodeLabels: { memory: {} }, edgeLabels: {} } as never,
      serviceClient: {} as never,
      client: {} as never,
      readModel,
    });
    expect(memories.readModel).toBe(readModel);
  });
});
