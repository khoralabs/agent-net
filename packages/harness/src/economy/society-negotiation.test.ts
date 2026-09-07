import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createSocietyChainStatusNotifier,
  createSocietyNegotiations,
} from "./society-negotiation.ts";
import type { SocietyRuntime } from "./society-runtime.ts";
import { resetSocietyStateForTests } from "./society-state.ts";
import type { NegotiationInvitation, SocietyConfig } from "./society-types.ts";

const dirs: string[] = [];

function config(): SocietyConfig {
  const dataDir = mkdtempSync(path.join(tmpdir(), "agent-net-negotiation-"));
  dirs.push(dataDir);
  return {
    sessionId: crypto.randomUUID(),
    dataDir,
    actorDids: ["did:a", "did:b", "did:c"],
    maxTokenBudget: 100,
    maxActorTurns: 10,
    cadenceMs: 0,
  };
}

afterEach(() => {
  resetSocietyStateForTests();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("society negotiation invitations", () => {
  test("requires responder acceptance and preserves relationship identity across chains", async () => {
    const cfg = config();
    const notifications: Array<{ actorDid: string; payload: unknown }> = [];
    const opened: Array<{ chainId: string; relationshipRef: string }> = [];
    const runtime = {
      deliverNegotiation: async (actorDid: string, payload: unknown) => {
        notifications.push({ actorDid, payload });
        return {} as never;
      },
    } as unknown as SocietyRuntime;
    const actions = createSocietyNegotiations({
      config: cfg,
      runtime,
      open: async (input) => {
        opened.push(input);
        return {
          channelId: `channel:${input.chainId}`,
          vellumSessionId: `vellum:${input.chainId}`,
        };
      },
    });

    const first = (await actions.invite("did:a", "did:b", "trade?")) as NegotiationInvitation;
    expect(opened).toHaveLength(0);
    const accepted = (await actions.respond("did:b", first.id, true)) as NegotiationInvitation;
    expect(accepted.status).toBe("accepted");
    expect(accepted.chainId).toStartWith("society:");
    expect(opened).toHaveLength(1);

    const second = (await actions.invite("did:b", "did:a")) as NegotiationInvitation;
    const acceptedAgain = (await actions.respond(
      "did:a",
      second.id,
      true,
    )) as NegotiationInvitation;
    expect(acceptedAgain.relationshipRef).toBe(accepted.relationshipRef);
    expect(acceptedAgain.chainId).not.toBe(accepted.chainId);
    expect(notifications.some((entry) => entry.actorDid === "did:b")).toBeTrue();
  });

  test("supports rejection, cancellation, expiry, and concurrent open chains", async () => {
    const cfg = config();
    const runtime = {
      deliverNegotiation: async () => ({}) as never,
    } as unknown as SocietyRuntime;
    const actions = createSocietyNegotiations({
      config: cfg,
      runtime,
      open: async (input) => ({
        channelId: `channel:${input.chainId}`,
        vellumSessionId: `vellum:${input.chainId}`,
      }),
    });

    const rejected = (await actions.invite("did:a", "did:b")) as NegotiationInvitation;
    expect(
      (await actions.respond("did:b", rejected.id, false)) as NegotiationInvitation,
    ).toMatchObject({
      status: "rejected",
    });
    const cancelled = (await actions.invite("did:a", "did:c")) as NegotiationInvitation;
    expect((await actions.cancel("did:a", cancelled.id)) as NegotiationInvitation).toMatchObject({
      status: "cancelled",
    });
    const invitations = (await Promise.all([
      actions.invite("did:a", "did:b"),
      actions.invite("did:a", "did:c"),
    ])) as NegotiationInvitation[];
    const [one, two] = invitations;
    if (one === undefined || two === undefined) throw new Error("invitations not created");
    const accepted = (await Promise.all([
      actions.respond("did:b", one.id, true),
      actions.respond("did:c", two.id, true),
    ])) as NegotiationInvitation[];
    expect(new Set(accepted.map((invitation) => invitation.chainId)).size).toBe(2);

    const expiringActions = createSocietyNegotiations({
      config: cfg,
      runtime,
      invitationTimeoutMs: 5,
      open: async (input) => ({
        channelId: `channel:${input.chainId}`,
        vellumSessionId: `vellum:${input.chainId}`,
      }),
    });
    const expired = (await expiringActions.invite("did:b", "did:c")) as NegotiationInvitation;
    await Bun.sleep(6);
    await expect(expiringActions.respond("did:c", expired.id, true)).rejects.toThrow(/not pending/);
    const expiredCancel = (await expiringActions.invite("did:b", "did:c")) as NegotiationInvitation;
    await Bun.sleep(6);
    await expect(expiringActions.cancel("did:b", expiredCancel.id)).rejects.toThrow(/not pending/);
  });

  test("gives every chain status notification a distinct deduplication key", async () => {
    const keys: string[] = [];
    const runtime = {
      deliverNegotiation: async (_actorDid: string, _payload: unknown, dedupeKey?: string) => {
        if (dedupeKey !== undefined) keys.push(dedupeKey);
        return {} as never;
      },
    } as unknown as SocietyRuntime;
    const notify = createSocietyChainStatusNotifier(runtime);
    const chain = {
      chainId: "chain-1",
      channelId: "channel-1",
      initiatorDid: "did:a",
      counterpartyDid: "did:b",
      status: "open",
      turnsCompleted: 1,
      maxTurns: 8,
      tokensUsed: 0,
    } as const;

    await notify(chain, { status: "running", runId: "run-1" });
    await notify(chain, { status: "running", tokensUsedDelta: 10 });

    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
  });
});
