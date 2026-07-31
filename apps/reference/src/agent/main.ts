import {
  type AgentUIMessage,
  type AgentWorkflowParams,
  agentResponse,
  ensureThread,
  getAgentChatClient,
  getAgentChatService,
  getDevAgentDid,
  HARNESS_AGENT_ID,
  HARNESS_CHAT_CHANNEL_ID,
  installAgentChat,
  resolveAgentChatSigner,
} from "@khoralabs/agent-net-harness";
import { start } from "workflow/api";

import "./otel.ts";
import { startTursoWorldWorker } from "../world/turso.ts";

void startTursoWorldWorker();

const DEV_AGENT_SELF_THREAD_ID = "harness-agent-self";

installAgentChat({
  resolveSigner: resolveAgentChatSigner,
});

async function ensureDevSelfThread(): Promise<{
  channelId: string;
  threadId: string;
}> {
  const chat = await getAgentChatClient();
  const threadId = await ensureThread(chat, {
    id: DEV_AGENT_SELF_THREAD_ID,
    metadata: { title: "Agent self-thread", kind: "agent-monologue" },
  });
  return { channelId: HARNESS_CHAT_CHANNEL_ID, threadId };
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return json({ ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/agent/bootstrap") {
    const chat = await ensureDevSelfThread();
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
      userTimeZone?: string;
    };

    const text = body.text?.trim();
    if (text === undefined || text.length === 0) {
      return json({ error: "text is required" }, { status: 400 });
    }

    const { threadId } = await ensureDevSelfThread();
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
        id: body.modelId?.trim() || process.env.AGENT_DEFAULT_MODEL?.trim() || "zai/glm-5.2-fast",
        maxSteps: 8,
      },
      context: {
        sessionId: runId,
        threadId: body.threadId?.trim() || threadId,
        messages: [message],
        instructions: ["Respond concisely."],
        userTimeZone: body.userTimeZone,
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
