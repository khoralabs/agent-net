import { inboxPostAuthorDid } from "../patterns/inbox/match.ts";
import type { InboxReactor } from "../patterns/inbox/reactor.ts";
import { type EngageDecision, runEngageDecision } from "../patterns/turn/index.ts";
import type { MarketplaceConfig } from "./config.ts";
import { reportLine } from "./report.ts";
import type { SeededAgent } from "./seed.ts";

export type SellerEvaluateResult = {
  seller: SeededAgent;
  decision: EngageDecision;
  authorDid: string | undefined;
};

/**
 * For each sell-side recipient of `needPostId`, run a structured engage/skip decision.
 * Results preserve `recipients` order (sellers filtered by recipientDids).
 */
export async function evaluateSellersOnInbox(input: {
  config: MarketplaceConfig;
  sellers: readonly SeededAgent[];
  recipientDids: readonly string[];
  needPostId: string;
  needBody: string;
  reactor: InboxReactor;
}): Promise<SellerEvaluateResult[]> {
  const recipients = input.sellers.filter((s) => input.recipientDids.includes(s.agent.did));

  return Promise.all(
    recipients.map(async (seller) => {
      const event = await input.reactor
        .waitForPost({
          did: seller.agent.did,
          postId: input.needPostId,
          timeoutMs: 1_000,
        })
        .catch(() => undefined);

      const authorDid =
        event !== undefined ? inboxPostAuthorDid([event], input.needPostId) : undefined;

      const prompt = [
        `You are ${seller.profile.displayName}, a ${seller.profile.side}-side MRO marketplace agent.`,
        `Your mandate / inventory context:`,
        seller.profile.memoryBlurb,
        ``,
        `A buy-side RFQ arrived in your inbox (post ${input.needPostId}):`,
        input.needBody,
        ``,
        `Decide whether to engage (open a private Vellum negotiation channel with the author) or skip.`,
        `Engage only if the RFQ matches your inventory and commercial preferences.`,
        `Respond with JSON: { "decision": "engage" | "skip", "reason": "..." }.`,
      ].join("\n");

      reportLine("evaluate.start", {
        sellerDid: seller.agent.did,
        externalId: seller.profile.externalId,
      });

      const decision = await runEngageDecision({
        modelId: input.config.modelId,
        prompt,
      });

      reportLine("evaluate.done", {
        sellerDid: seller.agent.did,
        externalId: seller.profile.externalId,
        decision: decision.decision,
        reason: decision.reason,
        authorDid,
      });

      return { seller, decision, authorDid };
    }),
  );
}
