import { afterEach, beforeEach, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import {
  createSignedTestChat,
  readPostSignatures,
  type SignedTestChat,
} from "../../tests/signed-chat.ts";
import { HARNESS_AGENT_ID } from "./capability-agents/index.ts";
import { runAgentWorkflow, withAssistantText } from "./run-agent-workflow.ts";
import type { AgentWorkflowParams } from "./types.ts";

test("withAssistantText preserves reasoning and tool parts", () => {
  const message: UIMessage = {
    id: "m1",
    role: "assistant",
    parts: [
      { type: "reasoning", text: "think", state: "done" },
      {
        type: "tool-lookup",
        toolCallId: "t1",
        state: "output-available",
        input: {},
        output: {},
      } as UIMessage["parts"][number],
    ],
  };
  const next = withAssistantText(message, "Hello");
  expect(next.parts.map((p) => p.type)).toEqual(["reasoning", "tool-lookup", "text"]);
  expect(next.parts.find((p): p is { type: "text"; text: string } => p.type === "text")?.text).toBe(
    "Hello",
  );
});

test("withAssistantText builds text-only message when parts empty", () => {
  const next = withAssistantText({ id: "m1", role: "assistant", parts: [] }, "Hi");
  expect(next.parts).toEqual([{ type: "text", text: "Hi" }]);
});

let chats: SignedTestChat[] = [];

beforeEach(() => {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  }
});

afterEach(() => {
  for (const chat of chats) chat.stop();
  chats = [];
});

async function openChat(): Promise<SignedTestChat> {
  const chat = await createSignedTestChat();
  chats.push(chat);
  return chat;
}

function userMessage(text: string): UIMessage {
  return {
    id: "user-message-1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function textStreamResult(chunks: string[]) {
  const text = chunks.join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start" });
      controller.enqueue({ type: "start-step", request: {}, warnings: [] });
      controller.enqueue({ type: "text-start", id: "t1" });
      for (const chunk of chunks) {
        controller.enqueue({ type: "text-delta", id: "t1", text: chunk });
      }
      controller.enqueue({ type: "text-end", id: "t1" });
      controller.enqueue({
        type: "finish-step",
        response: { id: "r1", timestamp: new Date(), modelId: "m" },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        performance: {},
        finishReason: "stop",
        rawFinishReason: "stop",
        providerMetadata: undefined,
      });
      controller.enqueue({
        type: "finish",
        finishReason: "stop",
        rawFinishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      controller.close();
    },
  });
  return {
    stream,
    text: Promise.resolve(text),
    finishReason: Promise.resolve("stop"),
    usage: Promise.resolve({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    }),
    toolResults: Promise.resolve([]),
    finalStep: Promise.resolve({
      response: {
        modelId: "zai/glm-5.2-fast",
        provider: "gateway",
      },
    }),
  };
}

function params(input: {
  runId: string;
  text: string;
  threadId: string;
  agentDid: string;
  userTimeZone?: string;
}): AgentWorkflowParams {
  return {
    runId: input.runId,
    agent: {
      id: HARNESS_AGENT_ID,
      name: "Network Harness Agent",
      actingFor: { type: "agent", id: input.agentDid },
    },
    model: {
      id: "zai/glm-5.2-fast",
      maxSteps: 3,
    },
    context: {
      sessionId: "session-1",
      threadId: input.threadId,
      messages: [userMessage(input.text)],
      instructions: ["Keep the response concise."],
      userTimeZone: input.userTimeZone,
    },
    output: {
      chat: {
        threadId: input.threadId,
        streamDeltas: false,
      },
    },
  };
}

test("runAgentWorkflow streams assistant text to signed chat thread", async () => {
  const chat = await openChat();
  const chunks = ["Hello", " from", " harness."];

  const result = await runAgentWorkflow(
    params({
      runId: "run-1",
      text: "Say hello",
      threadId: chat.threadId,
      agentDid: chat.agentDid,
    }),
    {
      chatService: chat.client,
      chatSigner: chat.chatSigner,
      streamTextFn: (() => textStreamResult(chunks)) as unknown as typeof import("ai").streamText,
    },
  );

  expect(result.chat.status).toBe("complete");
  expect(result.chat.threadId).toBe(chat.threadId);
  expect(
    result.message?.parts.some((part) => part.type === "text" && part.text === chunks.join("")),
  ).toBe(true);

  const posts = await chat.client.listPosts({ threadId: chat.threadId });
  expect(posts.items.some((post) => post.role === "assistant")).toBe(true);

  const signatures = await readPostSignatures(chat.client, chat.threadId);
  expect(signatures).toHaveLength(1);
  const envelope = signatures[0];
  if (!envelope) {
    throw new Error("No signatures found");
  }
  expect(envelope.algorithm).toBe("ed25519");
  expect(envelope.signer.id).toBe(chat.agentDid);
});

test("runAgentWorkflow passes reasoning and maxOutputTokens to streamText", async () => {
  const chat = await openChat();
  let captured: {
    reasoning?: string;
    maxOutputTokens?: number;
    system?: string;
  } = {};

  const base = params({
    runId: "run-reasoning",
    text: "Think carefully",
    threadId: chat.threadId,
    agentDid: chat.agentDid,
  });
  base.model.reasoning = "low";
  base.model.maxOutputTokens = 1024;
  base.responsePlan = { skillHints: ["missing-skill-should-skip"] };

  const result = await runAgentWorkflow(base, {
    chatService: chat.client,
    chatSigner: chat.chatSigner,
    streamTextFn: ((input: { reasoning?: string; maxOutputTokens?: number; system?: string }) => {
      captured = {
        reasoning: input.reasoning,
        maxOutputTokens: input.maxOutputTokens,
        system: input.system,
      };
      return textStreamResult(["ok"]);
    }) as unknown as typeof import("ai").streamText,
  });

  expect(result.chat.status).toBe("complete");
  expect(captured.reasoning).toBe("low");
  expect(captured.maxOutputTokens).toBe(1024);
});

test("runAgentWorkflow persists tool parts on the assistant chat post", async () => {
  const chat = await openChat();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start" });
      controller.enqueue({ type: "start-step", request: {}, warnings: [] });
      controller.enqueue({
        type: "tool-call",
        toolCallId: "c1",
        toolName: "lookup_profile",
        input: { did: "did:example:1" },
      });
      controller.enqueue({
        type: "tool-result",
        toolCallId: "c1",
        toolName: "lookup_profile",
        input: { did: "did:example:1" },
        output: { name: "Ada" },
      });
      controller.enqueue({ type: "text-start", id: "t1" });
      controller.enqueue({ type: "text-delta", id: "t1", text: "Found Ada." });
      controller.enqueue({ type: "text-end", id: "t1" });
      controller.enqueue({
        type: "finish-step",
        response: { id: "r1", timestamp: new Date(), modelId: "m" },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        performance: {},
        finishReason: "stop",
        rawFinishReason: "stop",
        providerMetadata: undefined,
      });
      controller.enqueue({
        type: "finish",
        finishReason: "stop",
        rawFinishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      controller.close();
    },
  });

  const result = await runAgentWorkflow(
    params({
      runId: "run-tools",
      text: "Lookup Ada",
      threadId: chat.threadId,
      agentDid: chat.agentDid,
    }),
    {
      chatService: chat.client,
      chatSigner: chat.chatSigner,
      streamTextFn: (() => ({
        stream,
        text: Promise.resolve("Found Ada."),
        finishReason: Promise.resolve("stop"),
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
        toolResults: Promise.resolve([]),
        finalStep: Promise.resolve({
          response: {
            modelId: "zai/glm-5.2-fast",
            provider: "gateway",
          },
        }),
      })) as unknown as typeof import("ai").streamText,
    },
  );

  const toolPart = result.message?.parts.find((part) => part.type === "tool-lookup_profile");
  expect(toolPart).toMatchObject({
    type: "tool-lookup_profile",
    toolCallId: "c1",
    state: "output-available",
    input: { did: "did:example:1" },
    output: { name: "Ada" },
  });

  const posts = await chat.client.listPosts({ threadId: chat.threadId });
  const assistant = posts.items.find((post) => post.role === "assistant");
  expect(assistant?.parts.some((part) => part.type === "tool-lookup_profile")).toBe(true);
});

test("runAgentWorkflow merges toolResults when UI stream omits tool parts", async () => {
  const chat = await openChat();
  const result = await runAgentWorkflow(
    params({
      runId: "run-tools-from-results",
      text: "Save a note",
      threadId: chat.threadId,
      agentDid: chat.agentDid,
    }),
    {
      chatService: chat.client,
      chatSigner: chat.chatSigner,
      streamTextFn: ((input: {
        onStepFinish?: (event: {
          toolResults: Array<{
            toolCallId: string;
            toolName: string;
            input: unknown;
            output: unknown;
          }>;
        }) => void;
      }) => {
        queueMicrotask(() => {
          input.onStepFinish?.({
            toolResults: [
              {
                toolCallId: "w1",
                toolName: "writeMemory",
                input: { namespace: "ns", key: "k", text: "note" },
                output: { memoryIds: ["mem-1"] },
              },
            ],
          });
        });
        return textStreamResult(["Saved."]);
      }) as unknown as typeof import("ai").streamText,
    },
  );

  expect(result.message?.parts.some((part) => part.type === "tool-writeMemory")).toBe(true);
  const sources = (result.message?.metadata as { sources?: unknown[] } | undefined)?.sources;
  expect(Array.isArray(sources) && sources.length > 0).toBe(true);
});

test("injects user-local datetime into system instructions when userTimeZone is set", async () => {
  const chat = await openChat();
  let system: string | undefined;

  await runAgentWorkflow(
    params({
      runId: "run-timezone",
      text: "What day is it?",
      threadId: chat.threadId,
      agentDid: chat.agentDid,
      userTimeZone: "America/New_York",
    }),
    {
      chatService: chat.client,
      chatSigner: chat.chatSigner,
      streamTextFn: ((input: { system?: string }) => {
        system = input.system;
        return textStreamResult(["Tuesday"]);
      }) as unknown as typeof import("ai").streamText,
    },
  );

  expect(system).toContain("stakeholder's current local date and time");
  expect(system).toContain("America/New_York");
});

test("resolveGatewayModel requires AI_GATEWAY_API_KEY", async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  const chat = await openChat();

  await expect(
    runAgentWorkflow(
      params({
        runId: "run-2",
        text: "Hi",
        threadId: chat.threadId,
        agentDid: chat.agentDid,
      }),
      {
        chatService: chat.client,
        chatSigner: chat.chatSigner,
      },
    ),
  ).rejects.toThrow("AI_GATEWAY_API_KEY");
});
