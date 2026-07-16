import { mkdirSync } from "node:fs";
import path from "node:path";
import { startChatHttpServer } from "@khoralabs/chat-http/server";

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

/** Start chat-http in-process (same pattern as the reference memories service). */
export async function startChatHttpService(opts: ChatServiceOptions): Promise<ChatServiceHandle> {
  mkdirSync(opts.dataDir, { recursive: true });
  const handle = await startChatHttpServer({
    storage: {
      kind: "local-sqlite",
      dbPath: path.join(opts.dataDir, "chat.db"),
    },
    token: opts.token,
    port: opts.port,
  });
  return {
    port: handle.port,
    baseUrl: handle.baseUrl,
    token: handle.token,
    stop: () => handle.stop(),
  };
}
