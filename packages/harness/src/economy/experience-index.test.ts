import { expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import { installNetworkEventsPlugin, listNetworkEvents } from "../index.ts";
import { createSqliteNetworkEventPersistencePlugin } from "../pool/network/persistence/sqlite/index.ts";

import {
  ECONOMY_ENCOUNTERS_NAMESPACE,
  indexEconomyExperience,
  listEconomyExperience,
  listEconomyRepertoire,
  resetEconomyExperienceClientForTests,
} from "./experience-index.ts";
import type { EconomyEncounter } from "./types.ts";

function tmpDir(): string {
  return path.join(os.tmpdir(), `economy-exp-${process.pid}-${crypto.randomUUID()}`);
}

test("indexes per-agent experience, repertoire provenance, and private memory projection", async () => {
  resetEconomyExperienceClientForTests();
  const dataDir = tmpDir();
  installNetworkEventsPlugin(createSqliteNetworkEventPersistencePlugin({ dataDir }));
  const sessionId = "exp-session";

  const encounter: EconomyEncounter = {
    id: "enc-1",
    sessionId,
    roundIndex: 0,
    initiatorDid: "did:key:a",
    counterpartyDid: "did:key:b",
    chainId: "chain-1",
    status: "completed",
    isRepeat: false,
    turnsCompleted: 3,
    tokensUsed: 12,
    terminalOutcome: "bound",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  };

  const memories: Array<{ agentDid: string; namespace: string; text: string }> = [];
  const records = await indexEconomyExperience({
    dataDir,
    sessionId,
    encounter,
    relationshipRef: "vellum-1",
    offersByAgent: {
      "did:key:a": [
        {
          offerType: "slot",
          portKind: "time",
          polarity: "expose",
          bindPolicyHash: "hash-a",
        },
      ],
      "did:key:b": [
        {
          offerType: "slot",
          portKind: "time",
          polarity: "bind",
          bindPolicyHash: "hash-a",
        },
      ],
    },
    writeMemory: async ({ agentDid, namespace, text }) => {
      memories.push({ agentDid, namespace, text });
    },
  });

  expect(records).toHaveLength(2);
  expect(records.every((r) => r.relationshipRef === "vellum-1")).toBe(true);

  const forA = await listEconomyExperience(dataDir, sessionId, "did:key:a");
  expect(forA).toHaveLength(1);
  expect(forA[0]?.peerDid).toBe("did:key:b");
  expect(forA[0]?.role).toBe("initiator");

  const forB = await listEconomyExperience(dataDir, sessionId, "did:key:b");
  expect(forB[0]?.peerDid).toBe("did:key:a");
  // Privacy: A cannot see B's experience list through this API without B's did
  expect(forA[0]?.agentDid).toBe("did:key:a");
  expect(forB[0]?.agentDid).toBe("did:key:b");

  const repA = await listEconomyRepertoire(dataDir, sessionId, "did:key:a");
  expect(repA).toHaveLength(1);
  expect(repA[0]?.usageCount).toBe(1);
  expect(repA[0]?.chainRefs).toEqual(["chain-1"]);

  // Second encounter bumps repertoire usage
  await indexEconomyExperience({
    dataDir,
    sessionId,
    encounter: {
      ...encounter,
      id: "enc-2",
      isRepeat: true,
      priorEncounterId: "enc-1",
      chainId: "chain-2",
    },
    offersByAgent: {
      "did:key:a": [
        {
          offerType: "slot",
          portKind: "time",
          polarity: "expose",
          bindPolicyHash: "hash-a",
        },
      ],
      "did:key:b": [],
    },
  });
  const repA2 = await listEconomyRepertoire(dataDir, sessionId, "did:key:a");
  expect(repA2[0]?.usageCount).toBe(2);
  expect(repA2[0]?.chainRefs).toEqual(["chain-1", "chain-2"]);

  expect(memories.every((m) => m.namespace === ECONOMY_ENCOUNTERS_NAMESPACE)).toBe(true);
  expect(memories.some((m) => m.agentDid === "did:key:a")).toBe(true);

  const events = await listNetworkEvents(sessionId, { kind: "economy.experience.indexed" });
  expect(events.length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(events).includes("private")).toBe(false);
});
