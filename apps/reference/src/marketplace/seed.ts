import type { AgentHandle, NetworkHarnessHandle } from "@khoralabs/agent-net-harness";

import { referenceMemoriesOntology } from "../memories/ontology.ts";
import {
  type MarketplaceAgentProfile,
  type MarketplaceConfig,
  oppositeSide,
  topicsFor,
} from "./config.ts";

export type SeededAgent = {
  profile: MarketplaceAgentProfile;
  agent: AgentHandle;
};

export async function spawnMarketplacePool(
  harness: NetworkHarnessHandle,
  config: MarketplaceConfig,
): Promise<SeededAgent[]> {
  const seeded: SeededAgent[] = [];
  for (const profile of config.profiles) {
    const agent = await harness.spawn({
      ontology: referenceMemoriesOntology,
      externalId: profile.externalId,
    });
    seeded.push({ profile, agent });
  }
  return seeded;
}

export async function seedMarketplaceAgent(
  harness: NetworkHarnessHandle,
  seeded: SeededAgent,
): Promise<void> {
  const { agent, profile } = seeded;
  const sideTopics = topicsFor(profile.side, profile.products, profile.services);
  const watchSide = oppositeSide(profile.side);

  // Seed a commercial post announcing presence (tagged vocab + semantic body).
  await agent.social.post({
    kind: "post",
    visibility: "public",
    topics: sideTopics,
    body:
      profile.side === "buy"
        ? `Looking to buy: ${profile.standingQuery}`
        : `Inventory for sale: ${profile.memoryBlurb}`,
  });

  // Standing subscription: tags use shared vocab; search text is semantic.
  await agent.social.post({
    kind: "subscription",
    visibility: "public",
    topics: [watchSide, ...profile.products, ...profile.services],
    search: { content: { text: profile.standingQuery } },
  });

  await agent.memories.integrate({
    kind: "interaction",
    ownerKey: agent.did,
    namespace: "marketplace",
    correlationId: `seed-${profile.externalId}`,
    occurredAtMs: Date.now(),
    payload: { side: profile.side, externalId: profile.externalId },
    features: { lexical: [profile.memoryBlurb], vector: [] },
    instructions: `You are a ${profile.side}-side MRO marketplace agent (${profile.displayName}).`,
  });

  await harness.registerAgent({
    agent,
    name: profile.displayName,
    instructions: [
      `Side: ${profile.side}. Products: ${profile.products.join(", ")}. Services: ${profile.services.join(", ")}.`,
      profile.memoryBlurb,
      profile.side === "sell"
        ? "When a matching buy RFQ arrives in your inbox, decide engage or skip based on inventory and commercial fit."
        : "Post clear RFQs with buy/product/service topics when you have a need. When a seller opens a private Vellum negotiation invite, decide accept or decline from mandate and commercial fit — do not auto-accept.",
    ],
    context: {
      side: profile.side,
      products: [...profile.products],
      services: [...profile.services],
    },
  });
}

export async function seedAllAgents(
  harness: NetworkHarnessHandle,
  seeded: readonly SeededAgent[],
): Promise<void> {
  for (const entry of seeded) {
    await seedMarketplaceAgent(harness, entry);
  }
}

export function partitionBySide(seeded: readonly SeededAgent[]): {
  buyers: SeededAgent[];
  sellers: SeededAgent[];
} {
  return {
    buyers: seeded.filter((s) => s.profile.side === "buy"),
    sellers: seeded.filter((s) => s.profile.side === "sell"),
  };
}
