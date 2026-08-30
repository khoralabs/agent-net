/** Shared marketplace tag vocabulary + default agent profiles. */

export const SIDE_TAGS = ["buy", "sell"] as const;
export type SideTag = (typeof SIDE_TAGS)[number];

export const PRODUCT_TAGS = ["bearing", "seal", "motor"] as const;
export type ProductTag = (typeof PRODUCT_TAGS)[number];

export const SERVICE_TAGS = ["spot-buy", "consignment", "oem-surplus"] as const;
export type ServiceTag = (typeof SERVICE_TAGS)[number];

export type MarketplaceAgentProfile = {
  externalId: string;
  side: SideTag;
  /** Product tags this agent deals in. */
  products: readonly ProductTag[];
  /** Service tags this agent deals in. */
  services: readonly ServiceTag[];
  /** Standing search prose for opposite-side commercial posts (percolator). */
  standingQuery: string;
  /** Short memory blurb for LLM evaluate context. */
  memoryBlurb: string;
  displayName: string;
};

export type MarketplaceConfig = {
  sessionId: string;
  dataDir: string;
  buyers: number;
  sellers: number;
  buyerIndex: number;
  modelId: string;
  maxSteps: number;
  inboxTimeoutMs: number;
  /** Need post body from the chosen buyer. */
  needBody: string;
  needProduct: ProductTag;
  needService: ServiceTag;
  profiles: MarketplaceAgentProfile[];
};

/** Default 1 buy + 3 sell MRO surplus profiles. */
export const DEFAULT_PROFILES: readonly MarketplaceAgentProfile[] = [
  {
    externalId: "buy-1",
    side: "buy",
    products: ["bearing"],
    services: ["spot-buy"],
    standingQuery: "for sale surplus 6205 deep groove ball bearing OEM stock lot",
    memoryBlurb:
      "Plant maintenance buyer. Needs SKF-equivalent 6205-2RS bearings in small lots within 2 weeks. Budget-conscious.",
    displayName: "Buyer Plant MRO",
  },
  {
    externalId: "sell-1",
    side: "sell",
    products: ["bearing"],
    services: ["spot-buy", "oem-surplus"],
    standingQuery: "need RFQ 6205 bearing deep groove ball buy spot",
    memoryBlurb:
      "Distributor with 40 units of 6205-2RS NOS. Prefers spot-buy above $4.50/unit. Midwest warehouse.",
    displayName: "Seller Bearing Co",
  },
  {
    externalId: "sell-2",
    side: "sell",
    products: ["seal"],
    services: ["consignment"],
    standingQuery: "need oil seal shaft RFQ buy consignment",
    memoryBlurb:
      "Seal specialist. No bearing inventory. Ignores bearing RFQs unless seal-adjacent.",
    displayName: "Seller Seal Works",
  },
  {
    externalId: "sell-3",
    side: "sell",
    products: ["bearing", "motor"],
    services: ["oem-surplus"],
    standingQuery: "need 6205 bearing motor surplus OEM buy",
    memoryBlurb:
      "OEM surplus broker. Has mixed 6205 lots but only wants large OEM surplus deals (>200 units).",
    displayName: "Seller OEM Surplus",
  },
];

export const DEFAULT_NEED_BODY =
  "RFQ: need 24 pcs 6205-2RS deep groove ball bearing, industrial grade, spot delivery under 14 days. Prefer sealed/OEM equivalent.";

export function buildMarketplaceConfig(input: {
  sessionId: string;
  dataDir: string;
  buyers?: number;
  sellers?: number;
  buyerIndex?: number;
  modelId?: string;
  maxSteps?: number;
  inboxTimeoutMs?: number;
}): MarketplaceConfig {
  const buyers = input.buyers ?? 1;
  const sellers = input.sellers ?? 3;
  const buyProfiles = DEFAULT_PROFILES.filter((p) => p.side === "buy").slice(0, buyers);
  const sellProfiles = DEFAULT_PROFILES.filter((p) => p.side === "sell").slice(0, sellers);
  while (buyProfiles.length < buyers) {
    const i = buyProfiles.length + 1;
    const template = DEFAULT_PROFILES.find((p) => p.side === "buy") ?? DEFAULT_PROFILES[0];
    if (template === undefined) throw new Error("DEFAULT_PROFILES empty");
    buyProfiles.push({
      ...template,
      externalId: `buy-${i}`,
      displayName: `Buyer ${i}`,
    });
  }
  while (sellProfiles.length < sellers) {
    const i = sellProfiles.length + 1;
    const template =
      DEFAULT_PROFILES.find(
        (p) => p.side === "sell" && p.externalId === `sell-${Math.min(i, 3)}`,
      ) ?? DEFAULT_PROFILES.find((p) => p.side === "sell");
    if (template === undefined) throw new Error("no sell template");
    sellProfiles.push({
      ...template,
      side: "sell",
      externalId: `sell-${i}`,
      displayName: `Seller ${i}`,
    });
  }
  const profiles = [...buyProfiles, ...sellProfiles];
  const buyerIndex = input.buyerIndex ?? 0;
  if (buyerIndex < 0 || buyerIndex >= buyProfiles.length) {
    throw new Error(`buyerIndex ${buyerIndex} out of range (buyers=${buyProfiles.length})`);
  }
  return {
    sessionId: input.sessionId,
    dataDir: input.dataDir,
    buyers,
    sellers,
    buyerIndex,
    modelId: input.modelId ?? "zai/glm-5.2-fast",
    maxSteps: input.maxSteps ?? 4,
    inboxTimeoutMs: input.inboxTimeoutMs ?? 30_000,
    needBody: DEFAULT_NEED_BODY,
    needProduct: "bearing",
    needService: "spot-buy",
    profiles,
  };
}

export function topicsFor(
  side: SideTag,
  products: readonly ProductTag[],
  services: readonly ServiceTag[],
): string[] {
  return [side, ...products, ...services];
}

export function oppositeSide(side: SideTag): SideTag {
  return side === "buy" ? "sell" : "buy";
}
