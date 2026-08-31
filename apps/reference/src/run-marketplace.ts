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
import { runMarketplacePipeline } from "./marketplace/pipeline.ts";
import { reportLine } from "./marketplace/report.ts";
import { referenceMemoriesOntology } from "./memories/ontology.ts";
import { installReferenceObservability } from "./observability/install.ts";
import { requireKhoraReachable, requireReferenceStackReachable } from "./services/stack-health.ts";
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
 * Reference marketplace CLI: spawn buy/sell pool, seed, percolator inbox,
 * seller evaluate, Vellum connect, buyer invite accept/decline (stop before NBC).
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

  reportLine("marketplace.start", {
    sessionId: config.sessionId,
    dataDir: config.dataDir,
    vellumDataDir: path.join(config.dataDir, "vellum"),
  });

  let stopInbox: (() => void) | undefined;
  let stopPairs: (() => void) | undefined;
  try {
    const result = await runMarketplacePipeline(harness, config);
    stopInbox = result.stopInbox;
    stopPairs = result.stopPairs;
    reportLine("marketplace.done", {
      needPostId: result.needPostId,
      recipientDids: result.recipientDids,
      engagers: result.evaluations
        .filter((e) => e.decision.decision === "engage")
        .map((e) => e.seller.profile.externalId),
      invites: result.inviteEvaluations.map((i) => ({
        sellerExternalId: i.seller.profile.externalId,
        sellerDid: i.seller.agent.did,
        decision: i.decision.decision,
        reason: i.decision.reason,
        sessionId: i.pair.sessionId,
        channelId: i.pair.channelId,
      })),
      accepted: result.inviteEvaluations
        .filter((i) => i.decision.decision === "accept")
        .map((i) => i.seller.profile.externalId),
      pairs: result.pairs.map((p) => ({
        sellerDid: p.initiatorDid,
        buyerDid: p.responderDid,
        sessionId: p.sessionId,
        channelId: p.channelId,
      })),
    });
  } finally {
    stopPairs?.();
    stopInbox?.();
    clearNetworkSessionContext();
    harness.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
