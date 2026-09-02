import path from "node:path";

import { getHarnessMemoriesTelemetry } from "@khoralabs/agent-net";

import { installReferenceObservability } from "./observability/install.ts";
import { startChatHttpService } from "./services/chat.ts";
import { startKhoraHost } from "./services/khora/index.ts";
import { startMemoriesService } from "./services/memories.ts";
import { startRelayServer } from "./services/relay.ts";
import { prepareSqliteForEncryptedMemories } from "./services/sqlite-prep.ts";
import { configureLocalWorldEnv, startLocalWorldWorker } from "./world/local.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";

const DEFAULT_CHAT_TOKEN = "reference-chat-token";
const DEFAULT_MEMORIES_ADMIN_TOKEN = "reference-memories-admin-token";
const DEFAULT_KHORA_ADMIN_TOKEN = "reference-khora-admin-token";
const DEFAULT_KHORA_OUTBOX_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
/** Fixed local ports — must match apps/reference/.env defaults. */
const DEFAULT_KHORA_PORT = 8788;
const DEFAULT_RELAY_PORT = 8790;
const DEFAULT_MEMORIES_PORT = 8791;
const DEFAULT_CHAT_PORT = 8792;

function parseArgs(argv: string[]): {
  dataDir: string;
  khoraPort?: number;
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

  const khoraPortRaw = args.get("khora-port");
  const memoriesPortRaw = args.get("memories-port");
  const relayPortRaw = args.get("relay-port");
  const chatPortRaw = args.get("chat-port");
  return {
    dataDir: resolveHarnessDataDir(args.get("data-dir")),
    chatToken:
      args.get("chat-token")?.trim() ||
      process.env.CHAT_INTERNAL_TOKEN?.trim() ||
      DEFAULT_CHAT_TOKEN,
    khoraPort: khoraPortRaw !== undefined ? Number.parseInt(khoraPortRaw, 10) : DEFAULT_KHORA_PORT,
    memoriesPort:
      memoriesPortRaw !== undefined ? Number.parseInt(memoriesPortRaw, 10) : DEFAULT_MEMORIES_PORT,
    relayPort: relayPortRaw !== undefined ? Number.parseInt(relayPortRaw, 10) : DEFAULT_RELAY_PORT,
    chatPort: chatPortRaw !== undefined ? Number.parseInt(chatPortRaw, 10) : DEFAULT_CHAT_PORT,
  };
}

function ensureKhoraDevEnvDefaults(): void {
  if (!process.env.KHORA_OUTBOX_ENCRYPTION_KEY?.trim()) {
    process.env.KHORA_OUTBOX_ENCRYPTION_KEY = DEFAULT_KHORA_OUTBOX_ENCRYPTION_KEY;
  }
  const admin =
    process.env.KHORA_ADMIN_TOKEN?.trim() ||
    process.env.ADMIN_ROOT_TOKEN?.trim() ||
    process.env.KHORA_CONSOLE_ROOT_TOKEN?.trim();
  if (admin === undefined || admin.length === 0) {
    process.env.ADMIN_ROOT_TOKEN = DEFAULT_KHORA_ADMIN_TOKEN;
    process.env.KHORA_ADMIN_TOKEN = DEFAULT_KHORA_ADMIN_TOKEN;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const dataDir = path.resolve(opts.dataDir);

  configureLocalWorldEnv({ dataDir });
  await startLocalWorldWorker({ dataDir });

  installReferenceObservability({ serviceName: "network-harness-memories" });

  prepareSqliteForEncryptedMemories();
  ensureKhoraDevEnvDefaults();

  const khora = await startKhoraHost({
    dataDir: path.join(dataDir, "khora"),
    port: opts.khoraPort,
  });
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

  process.env.KHORA_BASE_URL = khora.baseUrl;
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
        khoraBaseUrl: khora.baseUrl,
        memoriesBaseUrl: memories.baseUrl,
        relayBaseUrl: relay.baseUrl,
        chatBaseUrl: chat.baseUrl,
        khoraAdminToken:
          process.env.KHORA_ADMIN_TOKEN?.trim() ||
          process.env.ADMIN_ROOT_TOKEN?.trim() ||
          DEFAULT_KHORA_ADMIN_TOKEN,
        memoriesAdminToken: process.env.MEMORIES_SERVICE_ADMIN_TOKEN,
        workflowTargetWorld: process.env.WORKFLOW_TARGET_WORLD,
        workflowLocalDataDir: process.env.WORKFLOW_LOCAL_DATA_DIR,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    "Reference stack is running (khora + memories + relay + chat). Run marketplace/swarm in another terminal.\n",
  );

  const shutdown = () => {
    chat.stop();
    memories.stop();
    relay.stop();
    khora.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => undefined);
}

await main();
