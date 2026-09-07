import { emitNetworkEvent, networkEventId } from "../index.ts";

import {
  checkTokenBudgetRemaining,
  findPriorPairEncounter,
  incrementTokensUsed,
  insertEconomyEncounter,
  listEconomyEncounters,
  loadEconomyState,
  updateEconomyEncounter,
  updateEconomySessionStatus,
  upsertEconomyRound,
} from "./economy-state.ts";
import { indexEconomyExperience } from "./experience-index.ts";
import { getEconomySession } from "./session-store.ts";
import type { EconomyEncounter, EconomyResult, EconomyScheduledEncounter } from "./types.ts";

export type EconomyEncounterRunner = (input: {
  sessionId: string;
  encounter: EconomyEncounter;
  scheduled: EconomyScheduledEncounter;
}) => Promise<{
  chainId?: string;
  turnsCompleted?: number;
  tokensUsed?: number;
  terminalOutcome?: string;
  status?: EconomyEncounter["status"];
}>;

/** Default runner for chunks before NBC integration — records a deferred terminal. */
export const deferredEncounterRunner: EconomyEncounterRunner = async () => ({
  status: "completed",
  terminalOutcome: "deferred",
  turnsCompleted: 0,
  tokensUsed: 0,
});

function publicEncounterPayload(encounter: EconomyEncounter) {
  return {
    encounterId: encounter.id,
    roundIndex: encounter.roundIndex,
    initiatorDid: encounter.initiatorDid,
    counterpartyDid: encounter.counterpartyDid,
    chainId: encounter.chainId,
    isRepeat: encounter.isRepeat,
    priorEncounterId: encounter.priorEncounterId,
    status: encounter.status,
    turnsCompleted: encounter.turnsCompleted,
    tokensUsed: encounter.tokensUsed,
    terminalOutcome: encounter.terminalOutcome,
  };
}

export async function runEconomyRound(input: {
  sessionId: string;
  roundIndex: number;
  encounterRunner?: EconomyEncounterRunner;
}): Promise<{
  encounterIds: string[];
  terminated: boolean;
}> {
  const session = getEconomySession(input.sessionId);
  const { config, scenario, actors, economyStateId } = session;
  const dataDir = config.dataDir;

  if (!(await checkTokenBudgetRemaining(dataDir, economyStateId))) {
    return { encounterIds: [], terminated: true };
  }

  const ctx = {
    sessionId: input.sessionId,
    roundIndex: input.roundIndex,
    actors,
    scenarioState: session.scenarioState,
  };

  if (scenario.prepareRound !== undefined) {
    const prepared = await scenario.prepareRound(ctx);
    if (prepared?.scenarioState !== undefined) {
      session.scenarioState = prepared.scenarioState;
      ctx.scenarioState = prepared.scenarioState;
    }
  }

  await emitNetworkEvent({
    eventId: networkEventId({
      sessionId: input.sessionId,
      kind: "economy.round.started",
      turnIndex: input.roundIndex,
    }),
    sessionId: input.sessionId,
    tsMs: Date.now(),
    source: "economy",
    kind: "economy.round.started",
    message: `Economy round ${input.roundIndex} started`,
    payload: {
      roundIndex: input.roundIndex,
      scenarioId: scenario.id,
    },
  });

  const scheduled = await scenario.scheduleEncounters({
    ...ctx,
    scenarioState: session.scenarioState,
  });

  const now = Date.now();
  const encounterIds: string[] = [];
  const runner = input.encounterRunner ?? deferredEncounterRunner;

  for (const item of scheduled) {
    const prior = await findPriorPairEncounter(
      dataDir,
      input.sessionId,
      item.initiatorDid,
      item.counterpartyDid,
    );
    const encounter: EconomyEncounter = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      roundIndex: input.roundIndex,
      initiatorDid: item.initiatorDid,
      counterpartyDid: item.counterpartyDid,
      status: "scheduled",
      isRepeat: prior !== null,
      ...(prior !== null ? { priorEncounterId: prior.id } : {}),
      turnsCompleted: 0,
      tokensUsed: 0,
      createdAtMs: now,
      updatedAtMs: now,
    };
    await insertEconomyEncounter(dataDir, encounter);
    encounterIds.push(encounter.id);

    await emitNetworkEvent({
      eventId: networkEventId({
        sessionId: input.sessionId,
        kind: "economy.encounter.started",
        extra: encounter.id,
      }),
      sessionId: input.sessionId,
      tsMs: Date.now(),
      source: "economy",
      kind: "economy.encounter.started",
      message: "Economy encounter started",
      payload: publicEncounterPayload(encounter),
    });

    await updateEconomyEncounter(dataDir, encounter.id, { status: "running" });
    const result = await runner({
      sessionId: input.sessionId,
      encounter: { ...encounter, status: "running" },
      scheduled: item,
    });

    const completed = await updateEconomyEncounter(dataDir, encounter.id, {
      status: result.status ?? "completed",
      ...(result.chainId !== undefined ? { chainId: result.chainId } : {}),
      turnsCompleted: result.turnsCompleted ?? 0,
      tokensUsed: result.tokensUsed ?? 0,
      ...(result.terminalOutcome !== undefined ? { terminalOutcome: result.terminalOutcome } : {}),
    });

    if ((result.tokensUsed ?? 0) > 0) {
      await incrementTokensUsed(dataDir, economyStateId, result.tokensUsed ?? 0);
    }

    if (scenario.afterEncounter !== undefined) {
      const after = await scenario.afterEncounter({
        sessionId: input.sessionId,
        roundIndex: input.roundIndex,
        actors,
        scenarioState: session.scenarioState,
        encounter: completed,
      });
      if (after?.scenarioState !== undefined) {
        session.scenarioState = after.scenarioState;
      }
    }

    const chain =
      completed.chainId === undefined
        ? null
        : (session.negotiate?.getChain(completed.chainId) ?? null);
    const snapshot =
      completed.chainId === undefined
        ? null
        : ((await session.negotiate?.getSnapshot(completed.chainId).catch(() => null)) ?? null);
    await indexEconomyExperience({
      dataDir,
      sessionId: input.sessionId,
      encounter: completed,
      ...(chain?.relationshipRef !== undefined ? { relationshipRef: chain.relationshipRef } : {}),
      ...(chain?.vellumSessionId !== undefined ? { vellumSessionId: chain.vellumSessionId } : {}),
      ...(snapshot !== null ? { graph: snapshot.graph } : {}),
    });

    await emitNetworkEvent({
      eventId: networkEventId({
        sessionId: input.sessionId,
        kind: "economy.encounter.completed",
        extra: encounter.id,
      }),
      sessionId: input.sessionId,
      tsMs: Date.now(),
      source: "economy",
      kind: "economy.encounter.completed",
      message: "Economy encounter completed",
      payload: publicEncounterPayload(completed),
    });
  }

  await upsertEconomyRound(dataDir, {
    sessionId: input.sessionId,
    roundIndex: input.roundIndex,
    status: "completed",
    encounterIds,
    startedAtMs: now,
    completedAtMs: Date.now(),
  });
  await updateEconomySessionStatus(dataDir, economyStateId, "running", input.roundIndex);

  await emitNetworkEvent({
    eventId: networkEventId({
      sessionId: input.sessionId,
      kind: "economy.round.completed",
      turnIndex: input.roundIndex,
    }),
    sessionId: input.sessionId,
    tsMs: Date.now(),
    source: "economy",
    kind: "economy.round.completed",
    message: `Economy round ${input.roundIndex} completed`,
    payload: {
      roundIndex: input.roundIndex,
      encounterIds,
      scenarioId: scenario.id,
    },
  });

  const state = await loadEconomyState(dataDir, economyStateId);
  const terminated = await scenario.shouldTerminate({
    sessionId: input.sessionId,
    roundIndex: input.roundIndex,
    actors,
    scenarioState: session.scenarioState,
    tokensUsed: state.tokensUsed,
    maxTokenBudget: config.maxTokenBudget,
  });

  return { encounterIds, terminated };
}

export async function runEconomyUntilDone(input: {
  sessionId: string;
  encounterRunner?: EconomyEncounterRunner;
}): Promise<EconomyResult> {
  const session = getEconomySession(input.sessionId);
  const { config, economyStateId, actors, scenario } = session;
  let terminated = false;
  let roundsCompleted = 0;

  for (let roundIndex = 0; roundIndex < config.maxRounds; roundIndex++) {
    if (!(await checkTokenBudgetRemaining(config.dataDir, economyStateId))) {
      terminated = true;
      break;
    }
    const result = await runEconomyRound({
      sessionId: input.sessionId,
      roundIndex,
      encounterRunner: input.encounterRunner,
    });
    roundsCompleted = roundIndex + 1;
    if (result.terminated) {
      terminated = true;
      break;
    }
  }

  const state = await loadEconomyState(config.dataDir, economyStateId);
  const encounters = await listEconomyEncounters(config.dataDir, input.sessionId);
  await updateEconomySessionStatus(
    config.dataDir,
    economyStateId,
    "completed",
    state.currentRoundIndex,
  );

  return {
    sessionId: input.sessionId,
    tokensUsed: state.tokensUsed,
    maxTokenBudget: config.maxTokenBudget,
    roundsCompleted,
    encounterCount: encounters.length,
    actorDids: actors.map((a) => a.did),
    scenarioOutcome: {
      scenarioId: scenario.id,
      terminated,
      scenarioState: undefined, // never dump opaque private state into result by default
    },
  };
}
