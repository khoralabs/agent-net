import { expect, test } from "bun:test";

import { createAutonomousSmokeScenario } from "./autonomous-smoke-scenario.ts";

test("autonomous smoke observations keep objectives actor-private", async () => {
  const scenario = createAutonomousSmokeScenario({
    actorDids: ["did:a", "did:b"],
    turnsPerActor: 1,
  });
  const wake = {
    id: "wake",
    sessionId: "session",
    actorDid: "did:a",
    reason: "initial",
    dueAtMs: 0,
    status: "running",
    attempts: 1,
    createdAtMs: 0,
    updatedAtMs: 0,
  } as const;
  const a = await scenario.observe({ actorDid: "did:a", wake });
  const b = await scenario.observe({ actorDid: "did:b", wake: { ...wake, actorDid: "did:b" } });

  expect(a).not.toEqual(b);
  expect(JSON.stringify(a)).not.toContain("accept only");
  expect(JSON.stringify(b)).not.toContain("Find a reliable");
  await scenario.afterTurn?.({ actorDid: "did:a", wakeId: "a", tokensUsed: 0 });
  expect(await scenario.shouldTerminate()).toBeFalse();
  await scenario.afterTurn?.({ actorDid: "did:b", wakeId: "b", tokensUsed: 0 });
  expect(await scenario.shouldTerminate()).toBeTrue();
});
