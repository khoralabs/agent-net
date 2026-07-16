import { type ChatServiceClient, createChatClient } from "@khoralabs/chat-http/client";
import {
  createChatRoutesWithParams,
  dispatchChatRoute,
  requireInternalToken,
} from "@khoralabs/chat-http/routes";
import { createChatHttpRuntime } from "@khoralabs/chat-http/service";
import { createMemoryChatPersistence } from "@khoralabs/chat-persistence";
import type { ServerWebSocket } from "bun";

import { createHarnessChatBackend, type SignedChatBackend } from "../chat.ts";
import type { ResolveHarnessChatSigner } from "../chat-crypto.ts";

export type TestChatHttpHandle = {
  readonly baseUrl: string;
  readonly token: string;
  readonly client: ChatServiceClient;
  stop(): void;
};

type WsData = {
  threadId: string;
  unsubscribe?: () => void;
};

/** Ephemeral in-process chat-http for harness/swarm tests. */
export function startTestChatHttp(opts?: { token?: string; port?: number }): TestChatHttpHandle {
  const token = opts?.token ?? "test-chat-token";
  const runtime = createChatHttpRuntime({
    persistence: createMemoryChatPersistence(),
  });
  const routes = createChatRoutesWithParams(runtime.service, token);

  const server = Bun.serve<WsData>({
    port: opts?.port ?? 0,
    fetch(req, bunServer) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/ws/threads/")) {
        const authError = requireInternalToken(req, token);
        if (authError !== null) return authError;
        const threadId = decodeURIComponent(url.pathname.slice("/ws/threads/".length));
        if (threadId.length === 0) {
          return Response.json({ error: "threadId is required" }, { status: 400 });
        }
        const upgraded = bunServer.upgrade(req, { data: { threadId } satisfies WsData });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return dispatchChatRoute(routes, req);
    },
    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        ws.data.unsubscribe = runtime.subscribeToThread(ws.data.threadId, (event) => {
          ws.send(JSON.stringify(event));
        });
      },
      message() {},
      close(ws: ServerWebSocket<WsData>) {
        ws.data.unsubscribe?.();
      },
    },
  });

  const port = server.port ?? 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const client = createChatClient({ baseUrl, token });

  return {
    baseUrl,
    token,
    client,
    stop() {
      server.stop(true);
      runtime.close();
    },
  };
}

export function createTestHarnessChatBackend(input: {
  chatHttp: TestChatHttpHandle;
  resolveSigner: ResolveHarnessChatSigner;
}): SignedChatBackend {
  return createHarnessChatBackend({
    client: input.chatHttp.client,
    resolveSigner: input.resolveSigner,
  });
}
