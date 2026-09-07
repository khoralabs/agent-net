import { expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import {
  checkTokenBudgetRemaining,
  createEconomyState,
  findPriorPairEncounter,
  incrementTokensUsed,
  insertEconomyEncounter,
  listEconomyEncounters,
  loadEconomyRound,
  loadEconomyStateBySessionId,
  resetEconomyStateClientForTests,
  updateEconomyEncounter,
  updateEconomySessionStatus,
  upsertEconomyRound,
} from "./economy-state.ts";
import type { EconomyActor, EconomyConfig, EconomyEncounter } from "./types.ts";

function tmpDir(label: string): string {
  return path.join(os.tmpdir(), `economy-${label}-${process.pid}-${crypto.randomUUID()}`);
}

const actors: EconomyActor[] = [
  {
    did: "did:key:a",
    agentId: "did:key:a",
    label: "a",
    selfThreadId: "did:key:a-self",
    registeredStaticHash: "h1",
  },
  {
    did: "did:key:b",
    agentId: "did:key:b",
    label: "b",
    selfThreadId: "did:key:b-self",
    registeredStaticHash: "h2",
  },
];

test("economy state isolates sessions and tracks compute budget", async () => {
  resetEconomyStateClientForTests();
  const dataDir = tmpDir("budget");
  const config: EconomyConfig = {
    sessionId: "session-a",
    dataDir,
    actorCount: 2,
    maxTokenBudget: 100,
    maxRounds: 2,
    model: { id: "m" },
  };
  const state = await createEconomyState(dataDir, config, actors);
  expect(await checkTokenBudgetRemaining(dataDir, state.id)).toBe(true);
  await incrementTokensUsed(dataDir, state.id, 60);
  await incrementTokensUsed(dataDir, state.id, 50);
  expect(await checkTokenBudgetRemaining(dataDir, state.id)).toBe(false);

  const otherDir = tmpDir("other");
  const other = await createEconomyState(
    otherDir,
    { ...config, sessionId: "session-b", dataDir: otherDir },
    actors,
  );
  expect(await checkTokenBudgetRemaining(otherDir, other.id)).toBe(true);
  expect(await loadEconomyStateBySessionId(dataDir, "session-a")).not.toBeNull();
  expect(await loadEconomyStateBySessionId(dataDir, "session-b")).toBeNull();
});

test("rounds and encounters persist with first/repeat pair linkage", async () => {
  resetEconomyStateClientForTests();
  const dataDir = tmpDir("encounters");
  const sessionId = "session-enc";
  const config: EconomyConfig = {
    sessionId,
    dataDir,
    actorCount: 2,
    maxTokenBudget: 500,
    maxRounds: 3,
    model: { id: "m" },
  };
  const state = await createEconomyState(dataDir, config, actors);
  await updateEconomySessionStatus(dataDir, state.id, "running", 0);

  const now = Date.now();
  const first: EconomyEncounter = {
    id: "enc-1",
    sessionId,
    roundIndex: 0,
    initiatorDid: "did:key:a",
    counterpartyDid: "did:key:b",
    status: "scheduled",
    isRepeat: false,
    turnsCompleted: 0,
    tokensUsed: 0,
    createdAtMs: now,
    updatedAtMs: now,
  };
  await insertEconomyEncounter(dataDir, first);
  await upsertEconomyRound(dataDir, {
    sessionId,
    roundIndex: 0,
    status: "running",
    encounterIds: [first.id],
    startedAtMs: now,
  });

  await updateEconomyEncounter(dataDir, first.id, {
    status: "completed",
    chainId: "chain-1",
    turnsCompleted: 4,
    tokensUsed: 12,
    terminalOutcome: "bound",
  });

  const prior = await findPriorPairEncounter(dataDir, sessionId, "did:key:b", "did:key:a");
  expect(prior?.id).toBe("enc-1");
  expect(prior?.chainId).toBe("chain-1");

  const repeat: EconomyEncounter = {
    id: "enc-2",
    sessionId,
    roundIndex: 1,
    initiatorDid: "did:key:b",
    counterpartyDid: "did:key:a",
    status: "scheduled",
    isRepeat: true,
    priorEncounterId: prior?.id,
    turnsCompleted: 0,
    tokensUsed: 0,
    createdAtMs: now + 1,
    updatedAtMs: now + 1,
  };
  await insertEconomyEncounter(dataDir, repeat);
  await upsertEconomyRound(dataDir, {
    sessionId,
    roundIndex: 1,
    status: "completed",
    encounterIds: [repeat.id],
    startedAtMs: now + 1,
    completedAtMs: now + 2,
  });

  const round1 = await loadEconomyRound(dataDir, sessionId, 1);
  expect(round1?.encounterIds).toEqual(["enc-2"]);
  const listed = await listEconomyEncounters(dataDir, sessionId);
  expect(listed).toHaveLength(2);
  expect(listed[1]?.isRepeat).toBe(true);
  expect(listed[1]?.priorEncounterId).toBe("enc-1");
});

test("upsertEconomyRound preserves round timestamps when omitted", async () => {
  resetEconomyStateClientForTests();
  const dataDir = tmpDir("round-ts");
  const sessionId = "session-ts";
  const config: EconomyConfig = {
    sessionId,
    dataDir,
    actorCount: 2,
    maxTokenBudget: 100,
    maxRounds: 2,
    model: { id: "m" },
  };
  await createEconomyState(dataDir, config, actors);
  const startedAtMs = 1_700_000_000_000;
  await upsertEconomyRound(dataDir, {
    sessionId,
    roundIndex: 0,
    status: "running",
    encounterIds: [],
    startedAtMs,
  });
  await upsertEconomyRound(dataDir, {
    sessionId,
    roundIndex: 0,
    status: "completed",
    encounterIds: ["enc-x"],
    completedAtMs: startedAtMs + 5,
  });
  const round = await loadEconomyRound(dataDir, sessionId, 0);
  expect(round?.startedAtMs).toBe(startedAtMs);
  expect(round?.completedAtMs).toBe(startedAtMs + 5);
});

test("ensureSchema retries after a failed initialization", async () => {
  resetEconomyStateClientForTests();
  const dataDir = tmpDir("schema-retry");
  await Bun.write(dataDir, "not-a-directory");
  const config: EconomyConfig = {
    sessionId: "session-retry",
    dataDir,
    actorCount: 2,
    maxTokenBudget: 100,
    maxRounds: 1,
    model: { id: "m" },
  };
  await expect(createEconomyState(dataDir, config, actors)).rejects.toThrow();
  const { unlinkSync, mkdirSync } = await import("node:fs");
  unlinkSync(dataDir);
  mkdirSync(dataDir, { recursive: true });
  const state = await createEconomyState(dataDir, config, actors);
  expect(state.sessionId).toBe("session-retry");
});
