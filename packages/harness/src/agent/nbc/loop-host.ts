/**
 * Host-maintained chain index and callbacks for the NBC wake loop.
 *
 * **Temporary** — `getChain` mirrors product SQLite/index state because Vellum
 * does not yet expose negotiation status, turn limits, and brief fields on the
 * chain snapshot. Collapse into snapshot-driven loop state when upstream adds it.
 */
import type { NegotiationChainView } from "./who-should-act.ts";

/** Host-maintained chain index for the NBC wake loop (not Vellum state). */
export type NbcLoopChain = NegotiationChainView & {
  channelId: string;
  objective?: string;
  constraints?: string;
};

export type NbcLoopStatusPatch = {
  status?: "running" | "waiting-peer" | "completed" | "failed";
  outcome?: "bound" | "turn-limit" | "left" | "error";
  detail?: string;
  runId?: string;
};

export type NbcLoopStartTurnInput = {
  chainId: string;
  asDid: string;
  peerDid: string;
  initiatorDid: string;
  turnIndex: number;
  maxTurns: number;
  objective?: string;
  constraints?: string;
};

/** Host callbacks — no Bloom-specific types. */
export type NbcLoopHost = {
  getChain(chainId: string): NbcLoopChain | null;
  onStatus(chainId: string, patch: NbcLoopStatusPatch): void;
  localDids(): readonly string[];
  startTurn(input: NbcLoopStartTurnInput): Promise<{ runId?: string } | undefined>;
};
