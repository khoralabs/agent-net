import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createChatRoutesWithParams,
  dispatchChatRoute,
  requireInternalToken,
} from "@khoralabs/chat-http/routes";
import {
  closeChatDb,
  getChatService,
  initChatStorage,
  subscribeToChatThread,
} from "@khoralabs/chat-http/service";
import type { ServerWebSocket } from "bun";

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

/** Start chat-http in-process (same pattern as the reference memories service). */
export async function startChatHttpService(opts: ChatServiceOptions): Promise<ChatServiceHandle> {
  mkdirSync(opts.dataDir, { recursive: true });
  process.env.CHAT_INTERNAL_TOKEN = opts.token;
  process.env.CHAT_DB_PATH = path.join(opts.dataDir, "chat.db");
  delete process.env.TURSO_DATABASE_URL;

  closeChatDb();
  await initChatStorage();
  const token = opts.token;
  const routes = createChatRoutesWithParams(getChatService(), token);

  const server = Bun.serve<WsData>({
    port: opts.port ?? 0,
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
        ws.data.unsubscribe = subscribeToChatThread(ws.data.threadId, (event) => {
          ws.send(JSON.stringify(event));
        });
      },
      message() {},
      close(ws: ServerWebSocket<WsData>) {
        ws.data.unsubscribe?.();
      },
    },
  });

  const boundPort = server.port ?? opts.port ?? 0;
  return {
    port: boundPort,
    baseUrl: `http://127.0.0.1:${boundPort}`,
    token,
    stop() {
      server.stop(true);
      closeChatDb();
    },
  };
}
