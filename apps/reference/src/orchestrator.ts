import path from "node:path";

import { startChatHttpService } from "./services/chat.ts";
import { startMemoriesService } from "./services/memories.ts";
import { startRelayServer } from "./services/relay.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";
import { configureTursoWorldEnv, startTursoWorldWorker } from "./world/turso.ts";

const DEFAULT_CHAT_TOKEN = "reference-chat-token";

function parseArgs(argv: string[]): {
  dataDir: string;
  memoriesPort?: number;
  relayPort?: number;
  chatPort?: number;
  chatToken: string;
} {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      args.set(key, value);
      i++;
    } else {
      args.set(key, "true");
    }
  }

  const memoriesPortRaw = args.get("memories-port");
  const relayPortRaw = args.get("relay-port");
  const chatPortRaw = args.get("chat-port");
  return {
    dataDir: resolveHarnessDataDir(args.get("data-dir")),
    chatToken:
      args.get("chat-token")?.trim() ||
      process.env.CHAT_INTERNAL_TOKEN?.trim() ||
      DEFAULT_CHAT_TOKEN,
    ...(memoriesPortRaw !== undefined
      ? { memoriesPort: Number.parseInt(memoriesPortRaw, 10) }
      : {}),
    ...(relayPortRaw !== undefined ? { relayPort: Number.parseInt(relayPortRaw, 10) } : {}),
    ...(chatPortRaw !== undefined ? { chatPort: Number.parseInt(chatPortRaw, 10) } : {}),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(opts.dataDir);

  configureTursoWorldEnv({ dataDir });
  await startTursoWorldWorker({ dataDir });

  const memories = startMemoriesService({
    dataDir: path.join(dataDir, "memories"),
    port: opts.memoriesPort,
  });
  const relay = await startRelayServer({
    dataDir: path.join(dataDir, "relay"),
    port: opts.relayPort,
  });
  const chat = await startChatHttpService({
    dataDir: path.join(dataDir, "chat"),
    token: opts.chatToken,
    port: opts.chatPort,
  });

  process.env.MEMORIES_BASE_URL = memories.baseUrl;
  process.env.RELAY_BASE_URL = relay.baseUrl;
  process.env.CHAT_BASE_URL = chat.baseUrl;
  process.env.CHAT_INTERNAL_TOKEN = chat.token;

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        dataDir,
        memoriesBaseUrl: memories.baseUrl,
        relayBaseUrl: relay.baseUrl,
        chatBaseUrl: chat.baseUrl,
        workflowTargetWorld: process.env.WORKFLOW_TARGET_WORLD,
        workflowTursoDatabaseUrl: process.env.WORKFLOW_TURSO_DATABASE_URL,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    "Reference stack is running. Set KHORA_BASE_URL and use these URLs with the harness/swarm.\n",
  );

  const shutdown = () => {
    chat.stop();
    memories.stop();
    relay.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => undefined);
}

await main();
