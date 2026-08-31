import path from "node:path";

import {
  type AgentHandle,
  harnessAgentsDataDir,
  type NetworkHarnessHandle,
} from "@khoralabs/agent-net-harness";

import { createInboxReactor, type InboxReactor } from "../patterns/inbox/index.ts";
import {
  createNegotiatePairRegistry,
  type NegotiatePairRegistry,
  type OpenedPair,
} from "../patterns/negotiate/index.ts";
import type { MarketplaceConfig } from "./config.ts";
import { topicsFor } from "./config.ts";
import { evaluateSellersOnInbox, type SellerEvaluateResult } from "./evaluate-on-inbox.ts";
import { type BuyerInviteEvaluateResult, evaluateBuyerOnInvites } from "./evaluate-on-invite.ts";
import { reportLine } from "./report.ts";
import { partitionBySide, type SeededAgent, seedAllAgents, spawnMarketplacePool } from "./seed.ts";

export type MarketplacePipelineResult = {
  seeded: SeededAgent[];
  buyer: SeededAgent;
  sellers: SeededAgent[];
  needPostId: string;
  recipientDids: string[];
  evaluations: SellerEvaluateResult[];
  inviteEvaluations: BuyerInviteEvaluateResult[];
  /** Remaining open pairs after buyer declines are disconnected. */
  pairs: readonly OpenedPair[];
  stopInbox: () => void;
  stopPairs: () => void;
  reactor: InboxReactor;
};

/** On failure after inbox start: stop pairs then inbox before rethrow. */
export async function withInboxPairCleanup<T>(
  phase: { stopInbox: () => void },
  pairs: { stopAll: () => void },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    pairs.stopAll();
    phase.stopInbox();
    throw err;
  }
}

/**
 * Steps 1–4: spawn, seed, start inbox reactor, post buyer need, wait for sell receipts.
 */
export async function runMarketplaceThroughInbox(
  harness: NetworkHarnessHandle,
  config: MarketplaceConfig,
): Promise<{
  seeded: SeededAgent[];
  buyer: SeededAgent;
  sellers: SeededAgent[];
  needPostId: string;
  recipientDids: string[];
  stopInbox: () => void;
  reactor: InboxReactor;
}> {
  reportLine("pool.spawn.start", { buyers: config.buyers, sellers: config.sellers });
  const seeded = await spawnMarketplacePool(harness, config);
  reportLine("pool.spawn.done", {
    agents: seeded.map((s) => ({
      externalId: s.profile.externalId,
      did: s.agent.did,
      side: s.profile.side,
    })),
  });

  reportLine("seed.start");
  await seedAllAgents(harness, seeded);
  reportLine("seed.done");

  const { buyers, sellers } = partitionBySide(seeded);
  const buyer = buyers[config.buyerIndex];
  if (buyer === undefined) throw new Error("no buyer agent");

  const reactor = createInboxReactor((onEvent) => harness.subscribeInbox(onEvent));
  const stopInbox = reactor.start();

  const sellerDids = new Set(sellers.map((s) => s.agent.did));
  reactor.on({ dids: sellerDids }, (event) => {
    reportLine("inbox.event", { did: event.did, type: event.type });
  });

  reportLine("need.post.start", { buyerDid: buyer.agent.did });
  const needPost = await buyer.agent.social.post({
    kind: "post",
    visibility: "public",
    topics: topicsFor("buy", [config.needProduct], [config.needService]),
    body: config.needBody,
  });
  reportLine("need.post.done", { postId: needPost.id, topics: needPost.topics ?? [] });

  const recipientDids: string[] = [];
  await Promise.all(
    sellers.map(async (seller) => {
      try {
        await reactor.waitForPost({
          did: seller.agent.did,
          postId: needPost.id,
          timeoutMs: config.inboxTimeoutMs,
        });
        recipientDids.push(seller.agent.did);
        reportLine("inbox.received", {
          sellerDid: seller.agent.did,
          externalId: seller.profile.externalId,
          postId: needPost.id,
        });
      } catch (err) {
        reportLine("inbox.miss", {
          sellerDid: seller.agent.did,
          externalId: seller.profile.externalId,
          postId: needPost.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  reportLine("inbox.wait.done", {
    recipients: recipientDids.length,
    sellers: sellers.length,
  });

  return {
    seeded,
    buyer,
    sellers,
    needPostId: needPost.id,
    recipientDids,
    stopInbox,
    reactor,
  };
}

/**
 * Full pipeline steps 1–7 (inbox → seller evaluate → Vellum → buyer invite evaluate).
 * Declined invites are disconnected immediately; accepted pairs remain until process exit.
 */
export async function runMarketplacePipeline(
  harness: NetworkHarnessHandle,
  config: MarketplaceConfig,
): Promise<MarketplacePipelineResult> {
  const phase = await runMarketplaceThroughInbox(harness, config);
  const pairs: NegotiatePairRegistry = createNegotiatePairRegistry();

  return withInboxPairCleanup(phase, pairs, async () => {
    const evaluations = await evaluateSellersOnInbox({
      config,
      sellers: phase.sellers,
      recipientDids: phase.recipientDids,
      needPostId: phase.needPostId,
      needBody: config.needBody,
      reactor: phase.reactor,
    });

    const engagers = evaluations.filter((e) => e.decision.decision === "engage");
    reportLine("vellum.open.start", { count: engagers.length });

    for (const { seller } of engagers) {
      try {
        const pair = await pairs.open(seller.agent, phase.buyer.agent, {
          relayBaseUrl: harness.relayBaseUrl,
          agentsDataDir: harnessAgentsDataDir(config.dataDir),
          vellumDataDir: path.join(config.dataDir, "vellum"),
        });
        reportLine("vellum.open.done", {
          sellerDid: seller.agent.did,
          buyerDid: phase.buyer.agent.did,
          sessionId: pair.sessionId,
          channelId: pair.channelId,
        });
      } catch (err) {
        reportLine("vellum.open.error", {
          sellerDid: seller.agent.did,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const inviteEvaluations = await evaluateBuyerOnInvites({
      config,
      buyer: phase.buyer,
      needBody: config.needBody,
      pairs: pairs.list(),
      evaluations,
    });

    for (const invite of inviteEvaluations) {
      if (invite.decision.decision === "decline") {
        pairs.stop(invite.pair);
        reportLine("invite.decline", {
          sellerDid: invite.seller.agent.did,
          sellerExternalId: invite.seller.profile.externalId,
          sessionId: invite.pair.sessionId,
          channelId: invite.pair.channelId,
          reason: invite.decision.reason,
        });
      } else {
        reportLine("invite.accept", {
          sellerDid: invite.seller.agent.did,
          sellerExternalId: invite.seller.profile.externalId,
          sessionId: invite.pair.sessionId,
          channelId: invite.pair.channelId,
          reason: invite.decision.reason,
        });
      }
    }

    const accepted = inviteEvaluations.filter((i) => i.decision.decision === "accept");
    reportLine("marketplace.complete", {
      recipients: phase.recipientDids.length,
      engagers: engagers.length,
      invites: inviteEvaluations.length,
      accepted: accepted.length,
      pairs: pairs.list().length,
    });

    return {
      ...phase,
      evaluations,
      inviteEvaluations,
      pairs: pairs.list(),
      stopPairs: () => pairs.stopAll(),
    };
  });
}

export type { AgentHandle };
