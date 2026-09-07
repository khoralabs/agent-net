import type { SocietyToolkitContext } from "../agent/turn/tools/types.ts";
import { listEconomyExperience, listEconomyRepertoire } from "./experience-index.ts";
import type { SocietyRuntime } from "./society-runtime.ts";

export type SocietyInvitationActions = {
  invite(initiatorDid: string, peerDid: string, message?: string): Promise<unknown>;
  list(actorDid: string): Promise<unknown>;
  respond(actorDid: string, invitationId: string, accept: boolean): Promise<unknown>;
  cancel(actorDid: string, invitationId: string): Promise<unknown>;
};

export type SocietyExperienceActions = {
  search(
    actorDid: string,
    input: { peerDid?: string; terminalOutcome?: string; limit?: number },
  ): Promise<unknown>;
  repertoire(actorDid: string, input: { minUsageCount?: number; limit?: number }): Promise<unknown>;
};

export function createSocietyExperienceActions(
  dataDir: string,
  sessionId: string,
): SocietyExperienceActions {
  return {
    search: (actorDid, options) => listEconomyExperience(dataDir, sessionId, actorDid, options),
    repertoire: (actorDid, options) => listEconomyRepertoire(dataDir, sessionId, actorDid, options),
  };
}

/** Bind actor-scoped callbacks for the model toolkit; actor DID is never model-supplied. */
export function createSocietyActorTools(input: {
  actorDid: string;
  runtime: SocietyRuntime;
  invitations: SocietyInvitationActions;
  experience?: SocietyExperienceActions;
  now?: () => number;
}): SocietyToolkitContext {
  const now = input.now ?? Date.now;
  const experience = input.experience;
  return {
    requestWake: ({ delayMs = 0, payload }) =>
      input.runtime.requestWake(input.actorDid, payload, now() + delayMs),
    inviteNegotiation: ({ peerDid, message }) =>
      input.invitations.invite(input.actorDid, peerDid, message),
    listInvitations: () => input.invitations.list(input.actorDid),
    respondInvitation: ({ invitationId, accept }) =>
      input.invitations.respond(input.actorDid, invitationId, accept),
    cancelInvitation: ({ invitationId }) => input.invitations.cancel(input.actorDid, invitationId),
    ...(experience !== undefined
      ? {
          searchExperience: (query) => experience.search(input.actorDid, query),
          listRepertoire: (query) => experience.repertoire(input.actorDid, query),
        }
      : {}),
  };
}
