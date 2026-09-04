import { describe, expect, test } from "bun:test";

import { NBC_GENESIS_NOT_INITIATOR, type VellumChainSessionRegistry } from "../vellum-sessions.ts";
import {
  commitNbcTurn,
  type NbcTurnCommitChain,
  nbcNegotiationStatusFields,
} from "./nbc-turn-commit.ts";

const chain: NbcTurnCommitChain = {
  status: "open",
  initiatorDid: "did:key:alice",
  counterpartyDid: "did:key:bob",
  turnsCompleted: 1,
  maxTurns: 3,
};

function sessionsThat(
  commit: (
    chainId: string,
    input: { asDid: string; body: Record<string, unknown> },
  ) => Promise<{ sessionId: string; genesis: boolean }>,
): Pick<VellumChainSessionRegistry, "commitTurn"> {
  return { commitTurn: commit };
}

describe("commitNbcTurn", () => {
  test("commits and reports the new turn count", async () => {
    const calls: Array<{ chainId: string; asDid: string; body: Record<string, unknown> }> = [];
    const result = await commitNbcTurn({
      chainId: "c1",
      asDid: "did:key:bob",
      turn: { offer: 1 },
      chain,
      sessions: sessionsThat(async (chainId, input) => {
        calls.push({ chainId, ...input });
        return { sessionId: "s1", genesis: false };
      }),
    });

    expect(result).toEqual({
      ok: true,
      sessionId: "s1",
      turnsCompleted: 2,
      turnLimitReached: false,
    });
    expect(calls).toEqual([{ chainId: "c1", asDid: "did:key:bob", body: { offer: 1 } }]);
  });

  test("flags the turn limit on the final turn", async () => {
    const result = await commitNbcTurn({
      chainId: "c1",
      asDid: "did:key:alice",
      turn: {},
      chain: { ...chain, turnsCompleted: 2 },
      sessions: sessionsThat(async () => ({ sessionId: "s1", genesis: false })),
    });
    expect(result).toMatchObject({ ok: true, turnsCompleted: 3, turnLimitReached: true });
  });

  test("rejects chains that are not open without committing", async () => {
    let committed = false;
    const result = await commitNbcTurn({
      chainId: "c1",
      asDid: "did:key:alice",
      turn: {},
      chain: { ...chain, status: "closed" },
      sessions: sessionsThat(async () => {
        committed = true;
        return { sessionId: "s1", genesis: false };
      }),
    });
    expect(result).toEqual({
      ok: false,
      rejection: "chain-not-open",
      message: "Chain is closed",
    });
    expect(committed).toBe(false);
  });

  test("rejects a DID that is not a party", async () => {
    const result = await commitNbcTurn({
      chainId: "c1",
      asDid: "did:key:carol",
      turn: {},
      chain,
      sessions: sessionsThat(async () => ({ sessionId: "s1", genesis: false })),
    });
    expect(result).toMatchObject({ ok: false, rejection: "not-a-party" });
  });

  test("classifies genesis and missing-handle commit failures", async () => {
    const genesis = await commitNbcTurn({
      chainId: "c1",
      asDid: "did:key:bob",
      turn: {},
      chain,
      sessions: sessionsThat(async () => {
        throw new Error(NBC_GENESIS_NOT_INITIATOR);
      }),
    });
    expect(genesis).toEqual({
      ok: false,
      rejection: "genesis-not-initiator",
      message: NBC_GENESIS_NOT_INITIATOR,
    });

    const noHandle = await commitNbcTurn({
      chainId: "c1",
      asDid: "did:key:bob",
      turn: {},
      chain,
      sessions: sessionsThat(async () => {
        throw new Error("commitTurn: no Vellum handle for did:key:bob");
      }),
    });
    expect(noHandle).toEqual({
      ok: false,
      rejection: "no-vellum-handle",
      message: "No Vellum handle for asDid",
    });
  });

  test("surfaces other commit errors as commit-failed", async () => {
    const result = await commitNbcTurn({
      chainId: "c1",
      asDid: "did:key:bob",
      turn: {},
      chain,
      sessions: sessionsThat(async () => {
        throw new Error("relay unreachable");
      }),
    });
    expect(result).toEqual({
      ok: false,
      rejection: "commit-failed",
      message: "relay unreachable",
    });
  });
});

describe("nbcNegotiationStatusFields", () => {
  test("maps every patch field", () => {
    expect(
      nbcNegotiationStatusFields({
        status: "completed",
        outcome: "turn-limit",
        detail: "hit cap",
        runId: "run_1",
      }),
    ).toEqual({
      negotiationStatus: "completed",
      negotiationOutcome: "turn-limit",
      negotiationDetail: "hit cap",
      latestNegotiationWorkflowRunId: "run_1",
    });
  });

  test("omits absent fields so hosts can skip empty writes", () => {
    expect(nbcNegotiationStatusFields({ status: "running" })).toEqual({
      negotiationStatus: "running",
    });
    expect(nbcNegotiationStatusFields({})).toEqual({});
  });
});
