import {
  type AgentUIMessage,
  type AgentWorkflowParams,
  agentResponse,
  ensureAgentChatThread,
  getAgentChatService,
  getDevAgentDid,
  HARNESS_AGENT_ID,
  installAgentChat,
  resolveAgentChatSigner,
  resolveHarnessDataDir,
} from "@khoralabs/agent-net";
import { start } from "workflow/api";

import "./otel.ts";
import { createReferenceChatPersistence } from "../chat/sqlite.ts";
import { startTursoWorldWorker } from "../world/turso.ts";

void startTursoWorldWorker();

installAgentChat({
  persistence: createReferenceChatPersistence(
    resolveHarnessDataDir(process.env.HARNESS_AGENT_DATA_DIR),
  ),
  resolveSigner: resolveAgentChatSigner,
});

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return json({ ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/agent/bootstrap") {
    const chat = await ensureAgentChatThread();
    return json(chat);
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/agent/threads/")) {
    const threadId = url.pathname.split("/")[4];
    if (threadId === undefined) {
      return json({ error: "threadId is required" }, { status: 400 });
    }
    const posts = await getAgentChatService().listPosts({ threadId });
    return json(posts);
  }

  if (req.method === "POST" && url.pathname === "/api/agent/respond") {
    const body = (await req.json()) as {
      runId?: string;
      text?: string;
      threadId?: string;
      modelId?: string;
      streamDeltas?: boolean;
    };

    const text = body.text?.trim();
    if (text === undefined || text.length === 0) {
      return json({ error: "text is required" }, { status: 400 });
    }

    const { threadId } = await ensureAgentChatThread();
    const agentDid = await getDevAgentDid();
    const runId = body.runId?.trim() || crypto.randomUUID();
    const message: AgentUIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };

    const params: AgentWorkflowParams = {
      runId,
      agent: {
        id: HARNESS_AGENT_ID,
        name: "Network Harness Agent",
        actingFor: { type: "agent", id: agentDid },
      },
      model: {
        id:
          body.modelId?.trim() ||
          process.env.AGENT_DEFAULT_MODEL?.trim() ||
          "anthropic/claude-sonnet-4.6",
        maxSteps: 8,
      },
      context: {
        sessionId: runId,
        threadId: body.threadId?.trim() || threadId,
        messages: [message],
        instructions: ["Respond concisely."],
      },
      output: {
        chat: {
          threadId: body.threadId?.trim() || threadId,
          streamDeltas: body.streamDeltas ?? true,
        },
      },
    };

    await start(agentResponse, [params]);
    return json({ runId, threadId: params.output.chat.threadId, started: true });
  }

  return json({ error: "Not found" }, { status: 404 });
}
