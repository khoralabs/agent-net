import path from "node:path";

import {
  closeNetworkLog,
  configureTursoWorldEnv,
  createNetworkLogger,
  initNetworkLog,
  requireKhoraBaseUrl,
  requireMemoriesBaseUrl,
  requireRelayBaseUrl,
  resolveHarnessDataDir,
  startNetworkHarness,
  startTursoWorldWorker,
} from "@khoralabs/agent-net";
import { start } from "workflow/api";

import { provideHarnessForSession } from "./pending-harness.ts";
import type { SwarmConfig } from "./types.ts";
import { swarmOrchestrator } from "./workflows.ts";

function parseArgs(argv: string[]): {
  config: SwarmConfig;
  khoraBaseUrl?: string;
  relayBaseUrl?: string;
  memoriesBaseUrl?: string;
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

  const agentCount = Number.parseInt(args.get("agents") ?? "2", 10);
  const roles = (args.get("roles") ?? "researcher,coordinator")
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
  const dataDir = resolveHarnessDataDir(args.get("data-dir"));
  const sessionId = args.get("session-id")?.trim() || crypto.randomUUID();
  const khoraBaseUrl = args.get("khora-url")?.trim();
  const relayBaseUrl = args.get("relay-url")?.trim();
  const memoriesBaseUrl = args.get("memories-url")?.trim();

  return {
    config: {
      sessionId,
      dataDir,
      goal: args.get("goal") ?? "Coordinate and share findings with peer agents.",
      agentCount,
      maxTokenBudget: Number.parseInt(args.get("max-tokens") ?? "500000", 10),
      contextMessageLimit: Number.parseInt(args.get("context-limit") ?? "20", 10),
      model: {
        id: args.get("model") ?? "anthropic/claude-sonnet-4.6",
        maxSteps: Number.parseInt(args.get("max-steps") ?? "8", 10),
      },
      roles,
    },
    ...(khoraBaseUrl !== undefined && khoraBaseUrl.length > 0 ? { khoraBaseUrl } : {}),
    ...(relayBaseUrl !== undefined && relayBaseUrl.length > 0 ? { relayBaseUrl } : {}),
    ...(memoriesBaseUrl !== undefined && memoriesBaseUrl.length > 0 ? { memoriesBaseUrl } : {}),
  };
}

async function main(): Promise<void> {
  const { config, khoraBaseUrl, relayBaseUrl, memoriesBaseUrl } = parseArgs(process.argv.slice(2));
  configureTursoWorldEnv({ dataDir: config.dataDir });
  await startTursoWorldWorker({ dataDir: config.dataDir });

  const harness = await startNetworkHarness({
    dataDir: config.dataDir,
    khoraBaseUrl: requireKhoraBaseUrl(khoraBaseUrl),
    relayBaseUrl: requireRelayBaseUrl(relayBaseUrl),
    memoriesBaseUrl: requireMemoriesBaseUrl(memoriesBaseUrl),
  });
  provideHarnessForSession(config.sessionId, harness);

  initNetworkLog({ dataDir: config.dataDir, sessionId: config.sessionId });
  const logger = createNetworkLogger({ name: "network-harness-swarm", source: "swarm" });

  try {
    logger.info(
      {
        sessionId: config.sessionId,
        dataDir: path.resolve(config.dataDir),
        agentCount: config.agentCount,
      },
      "swarm.starting",
    );

    const run = await start(swarmOrchestrator, [config]);
    const result = await run.returnValue;
    logger.info({ result }, "swarm.completed");
  } finally {
    closeNetworkLog();
  }
}

await main();
