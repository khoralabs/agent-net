import type { OpenedPair } from "../patterns/negotiate/index.ts";
import { type InviteDecision, runInviteDecision } from "../patterns/turn/index.ts";
import type { MarketplaceConfig } from "./config.ts";
import type { SellerEvaluateResult } from "./evaluate-on-inbox.ts";
import { reportLine } from "./report.ts";
import type { SeededAgent } from "./seed.ts";

export type BuyerInviteEvaluateResult = {
  pair: OpenedPair;
  seller: SeededAgent;
  decision: InviteDecision;
};

/**
 * For each opened seller→buyer Vellum pair, run a structured accept/decline decision
 * on the buy side (pair-list driven; not Khora inbox).
 */
export async function evaluateBuyerOnInvites(input: {
  config: MarketplaceConfig;
  buyer: SeededAgent;
  needBody: string;
  /** Successful opened pairs (seller is initiator). */
  pairs: readonly OpenedPair[];
  /** Seller evaluate results used to attach engage reasons / profiles. */
  evaluations: readonly SellerEvaluateResult[];
}): Promise<BuyerInviteEvaluateResult[]> {
  const byDid = new Map(input.evaluations.map((e) => [e.seller.agent.did, e]));

  return Promise.all(
    input.pairs.map(async (pair) => {
      const evaluation = byDid.get(pair.initiatorDid);
      if (evaluation === undefined) {
        throw new Error(`no seller evaluation for pair initiator ${pair.initiatorDid}`);
      }
      const { seller } = evaluation;

      const prompt = [
        `You are ${input.buyer.profile.displayName}, a buy-side MRO marketplace agent.`,
        `Your mandate / buying preferences:`,
        input.buyer.profile.memoryBlurb,
        ``,
        `You posted this RFQ:`,
        input.needBody,
        ``,
        `Seller ${seller.profile.displayName} (${seller.profile.externalId}) opened a private Vellum negotiation invite.`,
        `Seller side context: ${seller.profile.memoryBlurb}`,
        `Seller engage reason: ${evaluation.decision.reason}`,
        `Channel ${pair.channelId}, session ${pair.sessionId}.`,
        ``,
        `Decide whether to accept the invite (keep the private channel open) or decline (disconnect).`,
        `Accept only if the seller is a credible commercial fit for your RFQ and mandate.`,
        `Respond with JSON: { "decision": "accept" | "decline", "reason": "..." }.`,
      ].join("\n");

      reportLine("invite.evaluate.start", {
        sellerDid: seller.agent.did,
        sellerExternalId: seller.profile.externalId,
        sessionId: pair.sessionId,
        channelId: pair.channelId,
      });

      const decision = await runInviteDecision({
        modelId: input.config.modelId,
        prompt,
      });

      reportLine("invite.evaluate.done", {
        sellerDid: seller.agent.did,
        sellerExternalId: seller.profile.externalId,
        sessionId: pair.sessionId,
        channelId: pair.channelId,
        decision: decision.decision,
        reason: decision.reason,
      });

      return { pair, seller, decision };
    }),
  );
}
