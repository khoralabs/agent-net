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
  deferredEncounterRunner,
  runEconomyUntilDone,
  setupEconomy,
  teardownEconomy,
} from "@khoralabs/agent-net/economy";
import { installMemoriesOntology } from "@khoralabs/agent-net/memories";
import { createSqliteNetworkEventPersistencePlugin } from "@khoralabs/agent-net/network-events/sqlite";

import { getEconomyScenario } from "./economy/scenario-registry.ts";
import { registerSmokeEconomyScenario } from "./economy/smoke-scenario.ts";
import { referenceMemoriesOntology } from "./memories/ontology.ts";
import { installReferenceObservability } from "./observability/install.ts";
import { requireKhoraReachable, requireReferenceStackReachable } from "./services/stack-health.ts";
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

/**
 * Reference economy CLI.
 * Runs setup → rounds → teardown via directive-free harness helpers.
 * Durable Workflow wrappers remain in `workflows/economy.ts` for hosts that
 * wire the Workflow SDK client transform; this CLI does not require that yet.
 */
async function main(): Promise<void> {
  registerSmokeEconomyScenario();
  const parsed = parseArgs(process.argv.slice(2));
  const { config, scenarioId } = parsed;

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

  const memoriesBaseUrl = requireMemoriesBaseUrl(parsed.memoriesBaseUrl);
  const relayBaseUrl = requireRelayBaseUrl(parsed.relayBaseUrl);
  const chatBaseUrl = requireChatBaseUrl(parsed.chatBaseUrl);
  const chatToken = requireChatToken(parsed.chatToken);
  const khoraBaseUrl = requireKhoraBaseUrl(parsed.khoraBaseUrl);

  await requireKhoraReachable(khoraBaseUrl);
  await requireReferenceStackReachable({
    memoriesBaseUrl,
    relayBaseUrl,
    chatBaseUrl,
  });

  const harness = await startNetworkHarness({
    dataDir: config.dataDir,
    chatBaseUrl,
    chatToken,
    networkEvents,
    khoraBaseUrl,
    relayBaseUrl,
    memoriesBaseUrl,
    memoriesAdminToken: requireMemoriesAdminToken(undefined),
  });
  installMemoriesOntology(referenceMemoriesOntology);

  let toreDown = false;
  try {
    const scenario = getEconomyScenario(scenarioId);
    logger.info(
      {
        sessionId: config.sessionId,
        dataDir: path.resolve(config.dataDir),
        actorCount: config.actorCount,
        scenarioId,
      },
      "economy.starting",
    );

    const { sessionId } = await setupEconomy({
      harness,
      config,
      ontology: referenceMemoriesOntology,
      scenario,
    });
    try {
      const result = await runEconomyUntilDone({
        sessionId,
        encounterRunner: deferredEncounterRunner,
      });
      logger.info({ result }, "economy.completed");
    } finally {
      // Clear bound session before teardown's harness.stop() so it does not
      // fire-and-forget harness.stopped against a DB it immediately closes.
      clearNetworkSessionContext();
      await teardownEconomy(sessionId);
      toreDown = true;
    }
  } finally {
    clearNetworkSessionContext();
    if (!toreDown) harness.stop();
  }
}

await main();
