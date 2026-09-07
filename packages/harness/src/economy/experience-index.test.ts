import { expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import type { NbcChainGraph } from "@khoralabs/obp-nbc";

import { installNetworkEventsPlugin, listNetworkEvents } from "../index.ts";
import { createSqliteNetworkEventPersistencePlugin } from "../pool/network/persistence/sqlite/index.ts";

import {
  ECONOMY_ENCOUNTERS_NAMESPACE,
  extractEconomyOffersByAgent,
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
    circumstancesByAgent: {
      "did:key:a": { market: "thin" },
      "did:key:b": { market: "thin" },
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
  expect(forA[0]?.circumstances).toEqual({ market: "thin" });
  expect(forA[0]?.provenance.source).toBe("host");

  const forB = await listEconomyExperience(dataDir, sessionId, "did:key:b");
  expect(forB[0]?.peerDid).toBe("did:key:a");
  expect(await listEconomyExperience(dataDir, sessionId, "did:key:a", { limit: 0 })).toEqual([]);
  // Privacy: A cannot see B's experience list through this API without B's did
  expect(forA[0]?.agentDid).toBe("did:key:a");
  expect(forB[0]?.agentDid).toBe("did:key:b");

  const repA = await listEconomyRepertoire(dataDir, sessionId, "did:key:a");
  expect(repA).toHaveLength(1);
  if (forA[0] === undefined) throw new Error("experience was not indexed");
  expect(repA[0]?.usageCount).toBe(1);
  expect(repA[0]?.chainRefs).toEqual(["chain-1"]);
  expect(repA[0]?.experienceRefs).toEqual([forA[0].id]);
  expect(repA[0]?.circumstances).toEqual([{ market: "thin" }]);
  expect(await listEconomyRepertoire(dataDir, sessionId, "did:key:a", { limit: 0 })).toEqual([]);

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

test("extracts actual offers, ports, binds, and provenance from an OBP graph", async () => {
  const graph = {
    parties: [
      { id: "did:key:a", name: "a" },
      { id: "did:key:b", name: "b" },
    ],
    extends: [],
    offers: [
      {
        id: "offer-a",
        type: "service",
        expires_turn: 8,
        expires_at_ms: 0,
        partyId: "did:key:a",
      },
      {
        id: "offer-b",
        type: "payment",
        expires_turn: 8,
        expires_at_ms: 0,
        partyId: "did:key:b",
      },
    ],
    ports: [
      {
        id: "port-a",
        kind: "service",
        promise: "deliver",
        ref: "atom:port-a",
        expires_turn: 8,
        expires_at_ms: 0,
        exposedOnOfferIds: ["offer-a"],
        bindCount: 1,
        bind_policy: { type: "object" },
      },
    ],
    exposes: [{ offerId: "offer-a", portId: "port-a" }],
    binds: [{ offerId: "offer-b", portId: "port-a", bind_payload: { amount: 10 } }],
  } as unknown as NbcChainGraph;

  const extracted = extractEconomyOffersByAgent(graph);
  expect(extracted["did:key:a"]).toEqual([
    expect.objectContaining({
      offerId: "offer-a",
      portId: "port-a",
      polarity: "expose",
      portKind: "service",
    }),
  ]);
  expect(extracted["did:key:b"]).toContainEqual(
    expect.objectContaining({
      offerId: "offer-b",
      portId: "port-a",
      polarity: "bind",
      bindPayload: { amount: 10 },
    }),
  );
});
