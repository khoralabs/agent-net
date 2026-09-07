import type { EconomyScenario } from "@khoralabs/agent-net/economy";

const scenarios = new Map<string, EconomyScenario>();

export function registerEconomyScenario(scenario: EconomyScenario): void {
  scenarios.set(scenario.id, scenario);
}

export function getEconomyScenario(id: string): EconomyScenario {
  const scenario = scenarios.get(id);
  if (scenario === undefined) {
    throw new Error(`economy scenario ${id} is not registered`);
  }
  return scenario;
}

export function listEconomyScenarios(): string[] {
  return [...scenarios.keys()].sort();
}

export function clearEconomyScenarioRegistryForTests(): void {
  scenarios.clear();
}
