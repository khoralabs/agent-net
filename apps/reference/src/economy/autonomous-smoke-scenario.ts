import type { ActorWake, SocietyScenario } from "@khoralabs/agent-net/economy";

export function createAutonomousSmokeScenario(input: {
  actorDids: string[];
  turnsPerActor: number;
}): SocietyScenario {
  const turns = new Map(input.actorDids.map((did) => [did, 0]));
  const objectives = new Map(
    input.actorDids.map((did, index) => [
      did,
      index % 2 === 0
        ? "Find a reliable collaborator and propose a mutually useful exchange."
        : "Evaluate collaboration proposals carefully and accept only terms that serve your interests.",
    ]),
  );

  return {
    id: "autonomous-smoke",
    observe: async ({ actorDid, wake }: { actorDid: string; wake: ActorWake }) => ({
      privateObjective: objectives.get(actorDid),
      peers: input.actorDids.filter((did) => did !== actorDid),
      wake: { reason: wake.reason, payload: wake.payload },
    }),
    afterTurn: async ({ actorDid }) => {
      turns.set(actorDid, (turns.get(actorDid) ?? 0) + 1);
    },
    shouldTerminate: async () =>
      input.actorDids.every((did) => (turns.get(did) ?? 0) >= input.turnsPerActor),
  };
}
