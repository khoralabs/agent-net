import { expect, test } from "bun:test";

import { validateSwarmConfig } from "./setup.ts";
import type { SwarmConfig } from "./types.ts";

test("validateSwarmConfig requires roles length to match agentCount", () => {
  const config: SwarmConfig = {
    sessionId: "s",
    dataDir: "/tmp",
    goal: "g",
    agentCount: 2,
    maxTokenBudget: 10,
    contextMessageLimit: 5,
    model: { id: "m" },
    roles: ["only-one"],
  };
  expect(() => validateSwarmConfig(config)).toThrow("roles length");
});
