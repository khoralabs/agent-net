import type { NetworkHarnessHandle } from "../index.ts";
import { emitNetworkEvent, networkEventId } from "../index.ts";

import { ensureEconomyAgentRegistered } from "./agent-registry.ts";
import { createEconomyState, updateEconomySessionStatus } from "./economy-state.ts";
import type { EconomyMemoriesOntology } from "./pending-ontology.ts";
import {
  type EconomyRuntimeSession,
  putEconomySession,
  removeEconomySession,
  resolveEconomyAgentWorkflowDeps,
} from "./session-store.ts";
import type { EconomyActor, EconomyConfig, EconomyScenario } from "./types.ts";
import { validateEconomyConfig } from "./validate.ts";

function selfThreadId(did: string): string {
  return `${did}-self`;
}

export async function setupEconomy(input: {
  harness: NetworkHarnessHandle;
  config: EconomyConfig;
  ontology: EconomyMemoriesOntology;
  scenario: EconomyScenario;
  scenarioState?: unknown;
}): Promise<{
  economyStateId: string;
  sessionId: string;
  actors: EconomyActor[];
}> {
  const { harness, config, ontology, scenario } = input;
  validateEconomyConfig(config);

  await emitNetworkEvent({
    eventId: networkEventId({ sessionId: config.sessionId, kind: "economy.setup.started" }),
    sessionId: config.sessionId,
    tsMs: Date.now(),
    source: "economy",
    kind: "economy.setup.started",
    message: "Starting economy setup",
    payload: {
      actorCount: config.actorCount,
      maxRounds: config.maxRounds,
      scenarioId: scenario.id,
      actorLabels: config.actorLabels,
    },
  });

  const spawned = [];
  for (let i = 0; i < config.actorCount; i++) {
    spawned.push(await harness.spawn({ ontology }));
  }

  const actors: EconomyActor[] = [];
  for (let i = 0; i < spawned.length; i++) {
    const agent = spawned[i];
    if (!agent) throw new Error("Agent not found");
    const label = config.actorLabels?.[i] ?? `actor-${i + 1}`;

    await agent.chat.createThread({
      id: selfThreadId(agent.did),
      metadata: { kind: "self", title: `${agent.did} self thread` },
    });

    // Public label only — private objectives stay in personal memories / scenarioState.
    const { staticHash } = await harness.registerAgent({
      agent,
      name: `Economy actor ${label}`,
      instructions: [`Economy actor ${label}`],
      context: { sessionId: config.sessionId, did: agent.did, label },
    });

    actors.push({
      did: agent.did,
      agentId: agent.did,
      label,
      selfThreadId: selfThreadId(agent.did),
      registeredStaticHash: staticHash,
    });
  }

  let scenarioState: unknown = input.scenarioState ?? {};
  if (scenario.prepareActors !== undefined) {
    const prepared = await scenario.prepareActors({ actors, scenarioState });
    if (prepared?.scenarioState !== undefined) {
      scenarioState = prepared.scenarioState;
    }
  }

  const economyState = await createEconomyState(config.dataDir, config, actors);

  const session: EconomyRuntimeSession = {
    config,
    harness,
    agents: spawned,
    actors,
    chatService: harness.signedChat.client,
    scenario,
    scenarioState,
    economyStateId: economyState.id,
    inboxUnsubscribes: [],
  };

  putEconomySession(config.sessionId, session);
  harness.bindNetworkSession({
    sessionId: config.sessionId,
    dataDir: config.dataDir,
    resolveAgentWorkflowDeps: (did) => resolveEconomyAgentWorkflowDeps(config.sessionId, did),
    ensureAgentRegistered: (did) =>
      ensureEconomyAgentRegistered(harness, config.dataDir, config.sessionId, did),
  });

  await updateEconomySessionStatus(config.dataDir, economyState.id, "running", 0);

  await emitNetworkEvent({
    eventId: networkEventId({ sessionId: config.sessionId, kind: "economy.setup.completed" }),
    sessionId: config.sessionId,
    tsMs: Date.now(),
    source: "economy",
    kind: "economy.setup.completed",
    message: "Economy setup completed",
    payload: {
      economyStateId: economyState.id,
      scenarioId: scenario.id,
      actors: actors.map((actor) => ({
        did: actor.did,
        label: actor.label,
        selfThreadId: actor.selfThreadId,
        registeredStaticHash: actor.registeredStaticHash,
      })),
    },
  });

  return {
    economyStateId: economyState.id,
    sessionId: config.sessionId,
    actors,
  };
}

export async function teardownEconomy(sessionId: string): Promise<void> {
  const session = removeEconomySession(sessionId);
  if (session === undefined) return;

  session.harness.unbindNetworkSession(sessionId);

  await updateEconomySessionStatus(session.config.dataDir, session.economyStateId, "teardown");

  await emitNetworkEvent({
    eventId: networkEventId({ sessionId, kind: "economy.teardown" }),
    sessionId,
    tsMs: Date.now(),
    source: "economy",
    kind: "economy.teardown",
    message: "Tearing down economy session",
    payload: { scenarioId: session.scenario.id },
  });

  for (const unsub of session.inboxUnsubscribes) {
    unsub();
  }
  session.harness.stop();
}
