import type { NbcLoopHost, NbcLoopStatusPatch } from "../agent/social/negotiate/nbc/loop-host.ts";
import type { SocietyInvitationActions } from "./actor-tools.ts";
import type { EconomyChainRecord } from "./encounter-registry.ts";
import type { SocietyRuntime } from "./society-runtime.ts";
import {
  createNegotiationInvitation,
  listNegotiationInvitations,
  loadNegotiationInvitation,
  updateNegotiationInvitation,
} from "./society-state.ts";
import type { NegotiationInvitation, SocietyConfig } from "./society-types.ts";

export type OpenSocietyNegotiation = (input: {
  chainId: string;
  relationshipRef: string;
  initiatorDid: string;
  responderDid: string;
  invitationId: string;
}) => Promise<{ channelId: string; vellumSessionId: string }>;

export function createSocietyChainStatusNotifier(runtime: SocietyRuntime) {
  let sequence = 0;
  return (chain: EconomyChainRecord, patch: NbcLoopStatusPatch) => {
    sequence++;
    const notificationSequence = sequence;
    return Promise.all(
      [chain.initiatorDid, chain.counterpartyDid].map((actorDid) =>
        runtime.deliverNegotiation(
          actorDid,
          { event: "chain-status", chainId: chain.chainId, patch },
          `chain:${chain.chainId}:${actorDid}:${notificationSequence}`,
        ),
      ),
    ).then(() => undefined);
  };
}

export function serializeSocietyNbcTurns(
  runtime: SocietyRuntime,
  startTurn: NbcLoopHost["startTurn"],
): NbcLoopHost["startTurn"] {
  return (turn) =>
    runtime.runActorTask(turn.asDid, async () => {
      const result = await startTurn(turn);
      await runtime.recordUsage(result?.tokensUsed ?? 0);
      return result;
    });
}

export function createSocietyNegotiations(input: {
  config: SocietyConfig;
  runtime: SocietyRuntime;
  open: OpenSocietyNegotiation;
  invitationTimeoutMs?: number;
}): SocietyInvitationActions {
  const { config, runtime } = input;
  const notify = (actorDid: string, invitation: NegotiationInvitation, event: string) =>
    runtime.deliverNegotiation(
      actorDid,
      { event, invitation },
      `negotiation:${invitation.id}:${event}:${actorDid}`,
    );

  return {
    async invite(initiatorDid, responderDid, message) {
      const invitation = await createNegotiationInvitation(
        config,
        initiatorDid,
        responderDid,
        message,
        input.invitationTimeoutMs === undefined
          ? undefined
          : Date.now() + input.invitationTimeoutMs,
      );
      await notify(responderDid, invitation, "invited");
      return invitation;
    },

    list(actorDid) {
      return listNegotiationInvitations(config.dataDir, config.sessionId, actorDid);
    },

    async respond(actorDid, invitationId, accept) {
      const invitation = await loadNegotiationInvitation(config.dataDir, invitationId);
      if (invitation === null) throw new Error(`negotiation invitation ${invitationId} not found`);
      if (!accept) {
        const rejected = await updateNegotiationInvitation(
          config.dataDir,
          invitationId,
          actorDid,
          "pending",
          "rejected",
        );
        await notify(rejected.initiatorDid, rejected, "rejected");
        return rejected;
      }

      const chainId = `society:${crypto.randomUUID()}`;
      const opening = await updateNegotiationInvitation(
        config.dataDir,
        invitationId,
        actorDid,
        "pending",
        "opening",
        { chainId },
      );
      try {
        const opened = await input.open({
          chainId,
          relationshipRef: opening.relationshipRef,
          initiatorDid: opening.initiatorDid,
          responderDid: opening.responderDid,
          invitationId,
        });
        const accepted = await updateNegotiationInvitation(
          config.dataDir,
          invitationId,
          actorDid,
          "opening",
          "accepted",
          {
            channelId: opened.channelId,
            vellumSessionId: opened.vellumSessionId,
          },
        );
        await Promise.all([
          notify(accepted.initiatorDid, accepted, "accepted"),
          notify(accepted.responderDid, accepted, "opened"),
        ]);
        return accepted;
      } catch (error) {
        const failed = await updateNegotiationInvitation(
          config.dataDir,
          invitationId,
          actorDid,
          "opening",
          "failed",
          { error: error instanceof Error ? error.message : String(error) },
        );
        await notify(failed.initiatorDid, failed, "failed");
        throw error;
      }
    },

    async cancel(actorDid, invitationId) {
      const cancelled = await updateNegotiationInvitation(
        config.dataDir,
        invitationId,
        actorDid,
        "pending",
        "cancelled",
      );
      await notify(cancelled.responderDid, cancelled, "cancelled");
      return cancelled;
    },
  };
}
