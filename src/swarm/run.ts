import path from "node:path";

import { start } from "workflow/api";

import {
  closeNetworkLog,
  createNetworkLogger,
  initNetworkLog,
} from "../observability/network-log.ts";
import { resolveHarnessDataDir } from "../workflow/paths.ts";
import { configureTursoWorldEnv, startTursoWorldWorker } from "../workflow/world.ts";
import type { SwarmConfig } from "./types.ts";
import { swarmOrchestrator } from "./workflows.ts";

function parseArgs(argv: string[]): SwarmConfig {
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

  return {
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
  };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  configureTursoWorldEnv({ dataDir: config.dataDir });
  await startTursoWorldWorker({ dataDir: config.dataDir });

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
