import path from "node:path";

import {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getHarnessObservability,
  installMemoriesOntology,
  requireChatBaseUrl,
  requireChatToken,
  requireKhoraBaseUrl,
  requireMemoriesAdminToken,
  requireMemoriesBaseUrl,
  requireRelayBaseUrl,
  startNetworkHarness,
} from "@khoralabs/agent-net-harness";
import { createNetworkEventPersistencePlugin } from "@khoralabs/network-events-sqlite";

import { buildMarketplaceConfig } from "./marketplace/config.ts";
import { runMarketplaceThroughInbox } from "./marketplace/pipeline.ts";
import { reportLine } from "./marketplace/report.ts";
import { referenceMemoriesOntology } from "./memories/ontology.ts";
import { installReferenceObservability } from "./observability/install.ts";
import { resolveHarnessDataDir } from "./world/paths.ts";
import { configureTursoWorldEnv, startTursoWorldWorker } from "./world/turso.ts";

function parseArgs(argv: string[]): {
  buyers: number;
  sellers: number;
  buyerIndex: number;
  dataDir: string;
  sessionId: string;
  modelId?: string;
  maxSteps?: number;
  inboxTimeoutMs?: number;
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

  const model = args.get("model");
  const maxStepsRaw = args.get("max-steps");
  const inboxTimeoutRaw = args.get("inbox-timeout-ms");
  const khoraUrl = args.get("khora-url")?.trim();
  const relayUrl = args.get("relay-url")?.trim();
  const memoriesUrl = args.get("memories-url")?.trim();
  const chatUrl = args.get("chat-url")?.trim();
  const chatTok = args.get("chat-token")?.trim();

  return {
    buyers: Number.parseInt(args.get("buyers") ?? "1", 10),
    sellers: Number.parseInt(args.get("sellers") ?? "3", 10),
    buyerIndex: Number.parseInt(args.get("buyer-index") ?? "0", 10),
    dataDir: resolveHarnessDataDir(args.get("data-dir")),
    sessionId: args.get("session-id")?.trim() || crypto.randomUUID(),
    ...(model !== undefined && model.length > 0 ? { modelId: model } : {}),
    ...(maxStepsRaw !== undefined ? { maxSteps: Number.parseInt(maxStepsRaw, 10) } : {}),
    ...(inboxTimeoutRaw !== undefined
      ? { inboxTimeoutMs: Number.parseInt(inboxTimeoutRaw, 10) }
      : {}),
    ...(khoraUrl !== undefined && khoraUrl.length > 0 ? { khoraBaseUrl: khoraUrl } : {}),
    ...(relayUrl !== undefined && relayUrl.length > 0 ? { relayBaseUrl: relayUrl } : {}),
    ...(memoriesUrl !== undefined && memoriesUrl.length > 0
      ? { memoriesBaseUrl: memoriesUrl }
      : {}),
    ...(chatUrl !== undefined && chatUrl.length > 0 ? { chatBaseUrl: chatUrl } : {}),
    ...(chatTok !== undefined && chatTok.length > 0 ? { chatToken: chatTok } : {}),
  };
}

/**
 * Reference marketplace CLI (steps 1–4 in this commit; 5–6 follow).
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const config = buildMarketplaceConfig({
    sessionId: parsed.sessionId,
    dataDir: parsed.dataDir,
    buyers: parsed.buyers,
    sellers: parsed.sellers,
    buyerIndex: parsed.buyerIndex,
    ...(parsed.modelId !== undefined ? { modelId: parsed.modelId } : {}),
    ...(parsed.maxSteps !== undefined ? { maxSteps: parsed.maxSteps } : {}),
    ...(parsed.inboxTimeoutMs !== undefined ? { inboxTimeoutMs: parsed.inboxTimeoutMs } : {}),
  });

  configureTursoWorldEnv({ dataDir: config.dataDir });
  await startTursoWorldWorker({ dataDir: config.dataDir });

  const networkEvents = createNetworkEventPersistencePlugin({ dataDir: config.dataDir });
  bindNetworkSessionContext({ sessionId: config.sessionId });
  installReferenceObservability({
    serviceName: "network-harness-marketplace",
    sessionId: config.sessionId,
    sessionJsonlPath: networkEvents.sessionJsonlPath(config.sessionId),
  });
  getHarnessObservability().createLogger({
    name: "network-harness-marketplace",
    source: "marketplace",
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

  reportLine("marketplace.start", {
    sessionId: config.sessionId,
    dataDir: config.dataDir,
    vellumDataDir: path.join(config.dataDir, "vellum"),
  });

  let stopInbox: (() => void) | undefined;
  try {
    const result = await runMarketplaceThroughInbox(harness, config);
    stopInbox = result.stopInbox;
    reportLine("marketplace.inbox.phase.done", {
      needPostId: result.needPostId,
      recipientDids: result.recipientDids,
      note: "evaluate + vellum phases land in a follow-up commit",
    });
  } finally {
    stopInbox?.();
    clearNetworkSessionContext();
    harness.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
