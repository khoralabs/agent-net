import path from "node:path";

import { getHarnessMemoriesTelemetry } from "@khoralabs/agent-net-harness";

import { installReferenceObservability } from "./observability/install.ts";
import { startChatHttpService } from "./services/chat.ts";
import { startMemoriesService } from "./services/memories.ts";
import { startRelayServer } from "./services/relay.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";
import { configureTursoWorldEnv, startTursoWorldWorker } from "./world/turso.ts";

const DEFAULT_CHAT_TOKEN = "reference-chat-token";
const DEFAULT_MEMORIES_ADMIN_TOKEN = "reference-memories-admin-token";
/** Fixed local ports — must match apps/reference/.env defaults. */
const DEFAULT_RELAY_PORT = 8790;
const DEFAULT_MEMORIES_PORT = 8791;
const DEFAULT_CHAT_PORT = 8792;

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
    memoriesPort:
      memoriesPortRaw !== undefined ? Number.parseInt(memoriesPortRaw, 10) : DEFAULT_MEMORIES_PORT,
    relayPort: relayPortRaw !== undefined ? Number.parseInt(relayPortRaw, 10) : DEFAULT_RELAY_PORT,
    chatPort: chatPortRaw !== undefined ? Number.parseInt(chatPortRaw, 10) : DEFAULT_CHAT_PORT,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(opts.dataDir);

  configureTursoWorldEnv({ dataDir });
  await startTursoWorldWorker({ dataDir });

  installReferenceObservability({ serviceName: "network-harness-memories" });

  const memories = startMemoriesService({
    dataDir: path.join(dataDir, "memories"),
    port: opts.memoriesPort,
    telemetry: getHarnessMemoriesTelemetry(),
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
  process.env.MEMORIES_SERVICE_ADMIN_TOKEN =
    process.env.MEMORIES_SERVICE_ADMIN_TOKEN?.trim() || DEFAULT_MEMORIES_ADMIN_TOKEN;

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        dataDir,
        memoriesBaseUrl: memories.baseUrl,
        relayBaseUrl: relay.baseUrl,
        chatBaseUrl: chat.baseUrl,
        memoriesAdminToken: process.env.MEMORIES_SERVICE_ADMIN_TOKEN,
        workflowTargetWorld: process.env.WORKFLOW_TARGET_WORLD,
        workflowTursoDatabaseUrl: process.env.WORKFLOW_TURSO_DATABASE_URL,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    "Reference stack is running. Also start khora-server (KHORA_BASE_URL, default :8788), then run marketplace/swarm.\n",
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
