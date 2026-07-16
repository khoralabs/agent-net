import { afterAll, expect, test } from "bun:test";
import { createHarnessChatBackend } from "@khoralabs/agent-net";
import { createChatClient } from "@khoralabs/chat-http/client";
import { createChatRoutesWithParams, dispatchChatRoute } from "@khoralabs/chat-http/routes";
import { createChatHttpRuntime } from "@khoralabs/chat-http/service";
import { createMemoryChatPersistence } from "@khoralabs/chat-persistence";
import { generateIdentity } from "@khoralabs/did-key-identity";
import { assembleTurnContext } from "./assemble-turn-context.ts";
import { appendInboxEntry } from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

const TEST_TOKEN = "swarm-assemble-test-token";
const runtime = createChatHttpRuntime({
  persistence: createMemoryChatPersistence(),
});
const routes = createChatRoutesWithParams(runtime.service, TEST_TOKEN);
const chatClient = createChatClient({
  baseUrl: "http://chat.test",
  token: TEST_TOKEN,
  fetchFn: (req, init) => {
    const request =
      req instanceof Request ? new Request(req, init) : new Request(req.toString(), init);
    return dispatchChatRoute(routes, request);
  },
});

afterAll(() => {
  runtime.close();
});

async function createChatFixture() {
  const dataDir = `/tmp/swarm-assemble-${process.pid}-${crypto.randomUUID()}`;
  const signer = await generateIdentity();
  const signers = new Map([[signer.did, signer]]);
  const backend = createHarnessChatBackend({
    client: chatClient,
    resolveSigner: (did) => Promise.resolve(signers.get(did)),
  });
  const client = backend.forAgent(signer.did);
  const thread = await client.createThread({
    id: `${signer.did}-self`,
    metadata: { kind: "self" },
  });
  await client.sendMessage(thread.id, { text: "prior self note", role: "user" });
  return { client, signer, threadId: thread.id, dataDir };
}

test("assembleTurnContext builds self-thread messages and instruction blocks", async () => {
  const { client, signer, threadId, dataDir } = await createChatFixture();
  const sessionId = "session-1";
  await appendInboxEntry(dataDir, sessionId, signer.did, {
    type: "inbox:notification",
    id: 1,
    did: signer.did,
    notification: {
      kind: "inbox_post",
      payload: {
        postId: "atp0:test-post",
        postKind: "post",
        subscriptionMatches: [{ subscriptionId: "sub-1", score: 1 }],
      },
    },
  });

  const config: SwarmConfig = {
    sessionId,
    dataDir,
    goal: "Coordinate",
    agentCount: 1,
    maxTokenBudget: 1000,
    contextMessageLimit: 5,
    model: { id: "test-model", maxSteps: 2 },
    roles: ["researcher"],
  };

  const agent: AgentLoopState = {
    did: signer.did,
    agentId: signer.did,
    role: "researcher",
    selfThreadId: threadId,
    registeredStaticHash: "hash",
    turnCount: 0,
  };

  const inboxEntries = [
    {
      id: "entry-1",
      did: signer.did,
      event: {
        type: "inbox:notification" as const,
        id: 1,
        did: signer.did,
        notification: {
          kind: "inbox_post" as const,
          payload: {
            postId: "atp0:test-post",
            postKind: "post" as const,
            subscriptionMatches: [{ subscriptionId: "sub-1", score: 1 }],
          },
        },
      },
      receivedAtMs: Date.now(),
    },
  ];

  const { params, inboxEntryIds } = await assembleTurnContext({
    config,
    agent,
    agentChat: client,
    inboxEntries,
  });

  expect(params.output.chat.threadId).toBe(threadId);
  expect(params.context.messages.length).toBeGreaterThan(0);
  expect(params.context.instructions?.some((block) => block.includes("<inbox_entries>"))).toBe(
    true,
  );
  expect(
    params.context.instructions?.some((block) => block.includes(`<thread id="${threadId}">`)),
  ).toBe(true);
  expect(inboxEntryIds).toHaveLength(1);
});
