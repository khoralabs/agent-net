import type { AgentHandle, NetworkHarnessHandle } from "@khoralabs/agent-net-harness";

import { createInboxReactor } from "../patterns/inbox/index.ts";
import type { MarketplaceConfig } from "./config.ts";
import { topicsFor } from "./config.ts";
import { reportLine } from "./report.ts";
import { partitionBySide, type SeededAgent, seedAllAgents, spawnMarketplacePool } from "./seed.ts";

export type MarketplacePipelineResult = {
  seeded: SeededAgent[];
  buyer: SeededAgent;
  sellers: SeededAgent[];
  needPostId: string;
  /** Sell DIDs that received the need post via percolator. */
  recipientDids: string[];
  stopInbox: () => void;
};

/**
 * Steps 1–4: spawn, seed, start inbox reactor, post buyer need, wait for sell receipts.
 */
export async function runMarketplaceThroughInbox(
  harness: NetworkHarnessHandle,
  config: MarketplaceConfig,
): Promise<MarketplacePipelineResult> {
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
  };
}

export type { AgentHandle };
