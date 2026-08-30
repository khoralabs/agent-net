import { describe, expect, mock, test } from "bun:test";

import type { AgentActor } from "../actor.ts";
import { createBoundAgentMemoriesClient } from "../../handle/memories-types.ts";
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
  };
}

describe("AgentSocial", () => {
  test("post/search/connect delegate to khora client; connect uses invite bank", async () => {
    const createPost = mock(async (body: unknown) => ({ id: "p1", body }));
    const search = mock(async () => ({ hits: [] }));
    const client = {
      createPost,
      search,
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
    const handle = {
      did: "did:key:self",
      client,
    } as unknown as AgentActor;
    const listInvites = mock(async () => ["tok-a", "tok-b"]);
    const social = new AgentSocial({
      handle,
      chat: fakeChat("did:key:self"),
      listInvites,
    });

    await social.post({ kind: "subscription", search: { content: { text: "x" } } });
    expect(createPost).toHaveBeenCalled();

    await social.search({ q: "hello" } as never);
    expect(search).toHaveBeenCalled();

    const invitation = await social.connect("did:key:peer");
    expect(invitation).toEqual({
      peerDid: "did:key:peer",
      kind: "invitation",
      token: "tok-a",
    });
    expect(listInvites).toHaveBeenCalled();
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
});
