/**
 * Shared NBC turn-commit procedure plus loop-status field mapping.
 *
 * The internal mesh routes and operator hosts that expose their own turn API
 * both need identical party checks, commit semantics, turn counting, and
 * turn-limit detection. Transport-specific concerns (auth, status codes, store
 * writes, change notifications) stay with the caller.
 */
import { NBC_GENESIS_NOT_INITIATOR, type VellumChainSessionRegistry } from "../vellum-sessions.ts";
import type { NbcLoopStatusPatch } from "./loop-host.ts";

/** Chain fields a turn commit needs from the host chain index. */
export type NbcTurnCommitChain = {
  status: string;
  initiatorDid: string;
  counterpartyDid: string;
  turnsCompleted: number;
  maxTurns: number;
};

export type NbcTurnCommitRejection =
  | "chain-not-open"
  | "not-a-party"
  | "genesis-not-initiator"
  | "no-vellum-handle"
  | "commit-failed";

export type NbcTurnCommitResult =
  | {
      ok: true;
      sessionId: string;
      /** Turn count after this commit. */
      turnsCompleted: number;
      turnLimitReached: boolean;
    }
  | { ok: false; rejection: NbcTurnCommitRejection; message: string };

export type CommitNbcTurnInput = {
  chainId: string;
  asDid: string;
  turn: Record<string, unknown>;
  chain: NbcTurnCommitChain;
  sessions: Pick<VellumChainSessionRegistry, "commitTurn">;
};

/**
 * Validate the acting party, commit the turn to Vellum, and report the new
 * turn count. Rejections are returned rather than thrown so each transport can
 * map them onto its own error surface.
 */
export async function commitNbcTurn(input: CommitNbcTurnInput): Promise<NbcTurnCommitResult> {
  const { chain, asDid } = input;
  if (chain.status !== "open") {
    return { ok: false, rejection: "chain-not-open", message: `Chain is ${chain.status}` };
  }
  if (asDid !== chain.initiatorDid && asDid !== chain.counterpartyDid) {
    return {
      ok: false,
      rejection: "not-a-party",
      message: "asDid must be a party on this chain",
    };
  }

  try {
    const committed = await input.sessions.commitTurn(input.chainId, {
      asDid,
      body: input.turn,
    });
    const turnsCompleted = chain.turnsCompleted + 1;
    return {
      ok: true,
      sessionId: committed.sessionId,
      turnsCompleted,
      turnLimitReached: turnsCompleted >= chain.maxTurns,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === NBC_GENESIS_NOT_INITIATOR) {
      return { ok: false, rejection: "genesis-not-initiator", message };
    }
    if (message.includes("no Vellum handle")) {
      return {
        ok: false,
        rejection: "no-vellum-handle",
        message: "No Vellum handle for asDid",
      };
    }
    return { ok: false, rejection: "commit-failed", message };
  }
}

/** Negotiation columns a host persists for a chain, derived from loop status. */
export type NbcNegotiationStatusFields = {
  negotiationStatus?: NonNullable<NbcLoopStatusPatch["status"]>;
  negotiationOutcome?: NonNullable<NbcLoopStatusPatch["outcome"]>;
  negotiationDetail?: string;
  latestNegotiationWorkflowRunId?: string;
};

/**
 * Map an {@link NbcLoopStatusPatch} onto negotiation fields for host storage.
 * Returns only the keys present on the patch, so an empty result means the
 * host has nothing to persist.
 */
export function nbcNegotiationStatusFields(patch: NbcLoopStatusPatch): NbcNegotiationStatusFields {
  return {
    ...(patch.status !== undefined ? { negotiationStatus: patch.status } : {}),
    ...(patch.outcome !== undefined ? { negotiationOutcome: patch.outcome } : {}),
    ...(patch.detail !== undefined ? { negotiationDetail: patch.detail } : {}),
    ...(patch.runId !== undefined ? { latestNegotiationWorkflowRunId: patch.runId } : {}),
  };
}
