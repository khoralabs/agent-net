import { expect, test } from "bun:test";

import type { EconomyConfig } from "./types.ts";
import { validateEconomyConfig } from "./validate.ts";

function baseConfig(overrides: Partial<EconomyConfig> = {}): EconomyConfig {
  return {
    sessionId: "econ-1",
    dataDir: "/tmp/econ",
    actorCount: 2,
    maxTokenBudget: 1000,
    maxRounds: 3,
    model: { id: "test-model" },
    ...overrides,
  };
}

test("validateEconomyConfig accepts a minimal valid config", () => {
  expect(() => validateEconomyConfig(baseConfig())).not.toThrow();
});

test("validateEconomyConfig requires actorCount >= 2", () => {
  expect(() => validateEconomyConfig(baseConfig({ actorCount: 1 }))).toThrow(/actorCount/);
});

test("validateEconomyConfig requires actorLabels length to match actorCount", () => {
  expect(() => validateEconomyConfig(baseConfig({ actorLabels: ["only-one"] }))).toThrow(
    /actorLabels length/,
  );
});

test("validateEconomyConfig rejects credential-like fields", () => {
  expect(() =>
    validateEconomyConfig(
      baseConfig({
        // @ts-expect-error intentional credential smuggling
        memoriesAdminToken: "secret",
      }),
    ),
  ).toThrow(/credential field/);
});

test("validateEconomyConfig rejects common credential key variants", () => {
  for (const key of ["accessToken", "clientSecret", "auth_token", "privateKey", "apiKey"]) {
    expect(() =>
      validateEconomyConfig({
        ...baseConfig(),
        [key]: "secret",
      } as EconomyConfig),
    ).toThrow(/credential field/);
  }
  expect(() => validateEconomyConfig(baseConfig({ maxTokenBudget: 50 }))).not.toThrow();
});
