import type { EconomyConfig, EconomyResult } from "@khoralabs/agent-net/economy";
import {
  deferredEncounterRunner,
  runEconomyUntilDone,
  setupEconomy,
  takeEconomyHarnessForSession,
  takeEconomyOntologyForSession,
  teardownEconomy,
} from "@khoralabs/agent-net/economy-run";

import { getEconomyScenario } from "../economy/scenario-registry.ts";

export async function setupEconomyStep(
  config: EconomyConfig,
  scenarioId: string,
): Promise<{ economyStateId: string; sessionId: string }> {
  "use step";
  const harness = takeEconomyHarnessForSession(config.sessionId);
  const ontology = takeEconomyOntologyForSession(config.sessionId);
  const scenario = getEconomyScenario(scenarioId);
  const result = await setupEconomy({ harness, config, ontology, scenario });
  return { economyStateId: result.economyStateId, sessionId: result.sessionId };
}

export async function runEconomyRoundsStep(sessionId: string): Promise<EconomyResult> {
  "use step";
  return runEconomyUntilDone({
    sessionId,
    encounterRunner: deferredEncounterRunner,
  });
}

export async function teardownEconomyStep(sessionId: string): Promise<void> {
  "use step";
  await teardownEconomy(sessionId);
}

/**
 * Economy orchestrator workflow. Hosting process must configure/start the
 * Workflow world before `start(economyOrchestrator, …)` runs.
 */
export async function economyOrchestrator(
  config: EconomyConfig,
  scenarioId: string,
): Promise<EconomyResult> {
  "use workflow";
  const { sessionId } = await setupEconomyStep(config, scenarioId);
  try {
    return await runEconomyRoundsStep(sessionId);
  } finally {
    await teardownEconomyStep(sessionId);
  }
}
