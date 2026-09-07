import path from "node:path";

import {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getHarnessObservability,
  requireChatBaseUrl,
  requireChatToken,
  requireKhoraBaseUrl,
  requireMemoriesAdminToken,
  requireMemoriesBaseUrl,
  requireRelayBaseUrl,
  startNetworkHarness,
} from "@khoralabs/agent-net";
import type { EconomyConfig } from "@khoralabs/agent-net/economy";
import {
  provideEconomyHarnessForSession,
  provideEconomyOntologyForSession,
} from "@khoralabs/agent-net/economy";
import { installMemoriesOntology } from "@khoralabs/agent-net/memories";
import { createSqliteNetworkEventPersistencePlugin } from "@khoralabs/agent-net/network-events/sqlite";
import { start } from "workflow/api";

import { registerSmokeEconomyScenario } from "./economy/smoke-scenario.ts";
import { referenceMemoriesOntology } from "./memories/ontology.ts";
import { installReferenceObservability } from "./observability/install.ts";
import { economyOrchestrator } from "./workflows/economy.ts";
import { configureLocalWorldEnv, startLocalWorldWorker } from "./world/local.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";

function parseArgs(argv: string[]): {
  config: EconomyConfig;
  scenarioId: string;
  khoraBaseUrl?: string;
  relayBaseUrl?: string;
  memoriesBaseUrl?: string;
  chatBaseUrl?: string;
  chatToken?: string;
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

  const actorCount = Number.parseInt(args.get("actors") ?? "2", 10);
  const labels = (args.get("labels") ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
  const dataDir = resolveHarnessDataDir(args.get("data-dir"));
  const sessionId = args.get("session-id")?.trim() || crypto.randomUUID();

  return {
    scenarioId: args.get("scenario")?.trim() || "smoke-lifecycle",
    config: {
      sessionId,
      dataDir,
      actorCount,
      maxTokenBudget: Number.parseInt(args.get("max-tokens") ?? "100000", 10),
      maxRounds: Number.parseInt(args.get("max-rounds") ?? "1", 10),
      model: {
        id: args.get("model") ?? "zai/glm-5.2-fast",
        maxSteps: Number.parseInt(args.get("max-steps") ?? "8", 10),
      },
      ...(labels.length > 0 ? { actorLabels: labels } : {}),
    },
    ...(args.get("khora-url")?.trim() ? { khoraBaseUrl: args.get("khora-url")?.trim() } : {}),
    ...(args.get("relay-url")?.trim() ? { relayBaseUrl: args.get("relay-url")?.trim() } : {}),
    ...(args.get("memories-url")?.trim()
      ? { memoriesBaseUrl: args.get("memories-url")?.trim() }
      : {}),
    ...(args.get("chat-url")?.trim() ? { chatBaseUrl: args.get("chat-url")?.trim() } : {}),
    ...(args.get("chat-token")?.trim() ? { chatToken: args.get("chat-token")?.trim() } : {}),
  };
}

/** Reference economy CLI: composition root for harness + scenario + Workflow. */
async function main(): Promise<void> {
  registerSmokeEconomyScenario();
  const parsed = parseArgs(process.argv.slice(2));
  const { config, scenarioId } = parsed;
  configureLocalWorldEnv({ dataDir: config.dataDir });
  await startLocalWorldWorker({ dataDir: config.dataDir });

  const networkEvents = createSqliteNetworkEventPersistencePlugin({ dataDir: config.dataDir });
  bindNetworkSessionContext({ sessionId: config.sessionId });
  installReferenceObservability({
    serviceName: "network-harness-economy",
    sessionJsonlPath: networkEvents.sessionJsonlPath(config.sessionId),
  });
  const logger = getHarnessObservability().createLogger({
    name: "network-harness-economy",
    source: "economy",
  });

  const harness = await startNetworkHarness({
    dataDir: config.dataDir,
    chatBaseUrl: requireChatBaseUrl(parsed.chatBaseUrl),
    chatToken: requireChatToken(parsed.chatToken),
    networkEvents,
    khoraBaseUrl: requireKhoraBaseUrl(parsed.khoraBaseUrl),
    relayBaseUrl: requireRelayBaseUrl(parsed.relayBaseUrl),
    memoriesBaseUrl: requireMemoriesBaseUrl(parsed.memoriesBaseUrl),
    memoriesAdminToken: requireMemoriesAdminToken(undefined),
  });
  installMemoriesOntology(referenceMemoriesOntology);
  provideEconomyHarnessForSession(config.sessionId, harness);
  provideEconomyOntologyForSession(config.sessionId, referenceMemoriesOntology);

  try {
    logger.info(
      {
        sessionId: config.sessionId,
        dataDir: path.resolve(config.dataDir),
        actorCount: config.actorCount,
        scenarioId,
      },
      "economy.starting",
    );
    const run = await start(economyOrchestrator, [config, scenarioId]);
    const result = await run.returnValue;
    logger.info({ result }, "economy.completed");
  } finally {
    clearNetworkSessionContext();
  }
}

await main();
