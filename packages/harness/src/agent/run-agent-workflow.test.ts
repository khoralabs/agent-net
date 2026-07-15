import { beforeEach, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { createSignedTestChat, readPostSignatures } from "../tests/signed-chat.ts";
import { HARNESS_AGENT_ID } from "./agents/index.ts";
import { runAgentWorkflow } from "./run-agent-workflow.ts";
import type { AgentWorkflowParams } from "./types.ts";

beforeEach(() => {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  }
});

function userMessage(text: string): UIMessage {
  return {
    id: "user-message-1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function params(input: {
  runId: string;
  text: string;
  threadId: string;
  agentDid: string;
}): AgentWorkflowParams {
  return {
    runId: input.runId,
    agent: {
      id: HARNESS_AGENT_ID,
      name: "Network Harness Agent",
      actingFor: { type: "agent", id: input.agentDid },
    },
    model: {
      id: "anthropic/claude-sonnet-4.6",
      maxSteps: 3,
    },
    context: {
      sessionId: "session-1",
      threadId: input.threadId,
      messages: [userMessage(input.text)],
      instructions: ["Keep the response concise."],
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
  const chat = await createSignedTestChat();
  const chunks = ["Hello", " from", " harness."];

  const result = await runAgentWorkflow(
    params({
      runId: "run-1",
      text: "Say hello",
      threadId: chat.threadId,
      agentDid: chat.agentDid,
    }),
    {
      chatService: chat.service,
      streamTextFn: (() => ({
        textStream: (async function* () {
          for (const chunk of chunks) yield chunk;
        })(),
        text: Promise.resolve(chunks.join("")),
        finishReason: Promise.resolve("stop"),
        usage: Promise.resolve({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        }),
        response: Promise.resolve({
          modelId: "anthropic/claude-sonnet-4.6",
          provider: "gateway",
        }),
      })) as unknown as typeof import("ai").streamText,
    },
  );

  expect(result.chat.status).toBe("complete");
  expect(result.chat.threadId).toBe(chat.threadId);
  expect(
    result.message?.parts.some((part) => part.type === "text" && part.text === chunks.join("")),
  ).toBe(true);

  const posts = await chat.service.listPosts({ threadId: chat.threadId });
  expect(posts.items.some((post) => post.role === "assistant")).toBe(true);

  const signatures = readPostSignatures(chat.backend.db, chat.threadId);
  expect(signatures).toHaveLength(1);
  const firstSignature = signatures[0];
  if (!firstSignature) {
    throw new Error("No signatures found");
  }
  const envelope = JSON.parse(firstSignature) as {
    algorithm: string;
    signer: { id: string };
  };
  expect(envelope.algorithm).toBe("ed25519");
  expect(envelope.signer.id).toBe(chat.agentDid);
});

test("resolveGatewayModel requires AI_GATEWAY_API_KEY", async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  const chat = await createSignedTestChat();

  await expect(
    runAgentWorkflow(
      params({
        runId: "run-2",
        text: "Hi",
        threadId: chat.threadId,
        agentDid: chat.agentDid,
      }),
      {
        chatService: chat.service,
      },
    ),
  ).rejects.toThrow("AI_GATEWAY_API_KEY");
});
