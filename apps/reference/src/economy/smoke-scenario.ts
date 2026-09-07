import type { EconomyScenario } from "@khoralabs/agent-net/economy";

import { registerEconomyScenario } from "./scenario-registry.ts";

/**
 * Minimal lifecycle smoke scenario: one empty round then terminate.
 * Does not encode market institutions, reputation, or conventions.
 */
export const smokeEconomyScenario: EconomyScenario = {
  id: "smoke-lifecycle",
  prepareRound: async () => undefined,
  scheduleEncounters: () => [],
  shouldTerminate: ({ roundIndex }) => roundIndex >= 0,
};

export function registerSmokeEconomyScenario(): void {
  registerEconomyScenario(smokeEconomyScenario);
}
