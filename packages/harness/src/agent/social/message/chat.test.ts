import { afterEach, describe, expect, test } from "bun:test";
import type { ChatEvent } from "@khoralabs/chat";
import {
  type ChatServiceClient,
  createHarnessChatBackend,
  type HarnessChatFetch,
  harnessChatFetch,
  installHarnessChatFetch,
} from "./chat.ts";

describe("installHarnessChatFetch", () => {
  afterEach(() => {
    installHarnessChatFetch(undefined);
  });

  test("stores and clears the override", () => {
    const stub: HarnessChatFetch = async () => new Response("ok");
    installHarnessChatFetch(stub);
    expect(harnessChatFetch()).toBe(stub);
    installHarnessChatFetch(undefined);
    expect(harnessChatFetch()).toBeUndefined();
  });
});

describe("AgentChatClient.subscribeToThread", () => {
  test("checks participation and forwards events", async () => {
    let emit: ((event: ChatEvent) => void) | undefined;
    let unsubscribed = false;
    const client = {
      getChannel: async () => ({}),
      listThreadParticipants: async () => [{ type: "agent", id: "did:key:alice" }],
      subscribeToThread: (_threadId: string, handler: (event: ChatEvent) => void) => {
        emit = handler;
        return () => {
          unsubscribed = true;
        };
      },
    } as unknown as ChatServiceClient;
    const chat = createHarnessChatBackend({
      client,
      resolveSigner: async () => undefined,
    }).forAgent("did:key:alice");
    const events: ChatEvent[] = [];

    const unsubscribe = await chat.subscribeToThread("thread-1", (event) => events.push(event));
    emit?.({
      type: "post.deleted",
      threadId: "thread-1",
      postId: "post-1",
      deletedAtMs: 1,
    });

    expect(events).toHaveLength(1);
    unsubscribe();
    expect(unsubscribed).toBe(true);
  });

  test("rejects subscriptions for non-participants", async () => {
    let subscribed = false;
    const client = {
      getChannel: async () => ({}),
      listThreadParticipants: async () => [{ type: "agent", id: "did:key:bob" }],
      subscribeToThread: () => {
        subscribed = true;
        return () => {};
      },
    } as unknown as ChatServiceClient;
    const chat = createHarnessChatBackend({
      client,
      resolveSigner: async () => undefined,
    }).forAgent("did:key:alice");

    await expect(chat.subscribeToThread("thread-1", () => {})).rejects.toThrow(
      "does not have access",
    );
    expect(subscribed).toBe(false);
  });
});
