import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ChatEvent } from "@khoralabs/chat";
import {
  CHAT_ERROR_CODE,
  CHAT_HTTP_PATH,
  CHAT_PROTOCOL_VERSION,
  type ChatHealthResponse,
  createChatRoutesWithParams,
  dispatchChatRoute,
  requireInternalToken,
} from "@khoralabs/chat/http";
import { createChatHttpRuntime, createChatStorage } from "@khoralabs/chat/http/service";
import type { ServerWebSocket } from "bun";
import { serve } from "bun";

export type ChatServiceOptions = {
  dataDir: string;
  token: string;
  port?: number;
};

export type ChatServiceHandle = {
  readonly port: number;
  readonly baseUrl: string;
  readonly token: string;
  stop(): void;
};

type WsData = {
  threadId: string;
  unsubscribe?: () => void;
};

/**
 * Start chat-http in-process without importing `@khoralabs/chat/http/server`.
 * Published server.js incorrectly treats every import as main and auto-binds :3002
 * (default db under ./data), which also loads Bun's bundled SQLite before sqlite-vec prep.
 */
export async function startChatHttpService(opts: ChatServiceOptions): Promise<ChatServiceHandle> {
  mkdirSync(opts.dataDir, { recursive: true });
  const storage = await createChatStorage({
    kind: "local-sqlite",
    dbPath: path.join(opts.dataDir, "chat.db"),
  });
  const runtime = createChatHttpRuntime({
    persistence: storage.persistence,
  });
  const routes = createChatRoutesWithParams(runtime.service, opts.token);
  const token = opts.token;

  const server = serve<WsData>({
    port: opts.port ?? 0,
    fetch(req, bunServer) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === CHAT_HTTP_PATH.health) {
        const body: ChatHealthResponse = { ok: true, version: CHAT_PROTOCOL_VERSION };
        return Response.json(body);
      }
      if (url.pathname.startsWith(CHAT_HTTP_PATH.threadsWsPrefix)) {
        const authError = requireInternalToken(req, token);
        if (authError !== null) return authError;
        const threadId = decodeURIComponent(
          url.pathname.slice(CHAT_HTTP_PATH.threadsWsPrefix.length),
        );
        if (threadId.length === 0) {
          return Response.json(
            { error: "threadId is required", code: CHAT_ERROR_CODE.invalid_request },
            { status: 400 },
          );
        }
        const upgraded = bunServer.upgrade(req, { data: { threadId } satisfies WsData });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return dispatchChatRoute(routes, req);
    },
    websocket: {
      open(ws: ServerWebSocket<WsData>) {
        ws.data.unsubscribe = runtime.subscribeToThread(ws.data.threadId, (event: ChatEvent) => {
          ws.send(JSON.stringify(event));
        });
      },
      message() {},
      close(ws: ServerWebSocket<WsData>) {
        ws.data.unsubscribe?.();
      },
    },
  });

  const port = server.port ?? opts.port ?? 0;
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    token,
    stop() {
      server.stop(true);
      runtime.close();
      storage.close();
    },
  };
}
