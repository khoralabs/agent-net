import { expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import { installNetworkEventsPlugin } from "@khoralabs/agent-net";
import { createNetworkEventPersistencePlugin } from "@khoralabs/network-events-sqlite";

import {
  appendInboxEntry,
  checkTokenBudgetRemainingStep,
  createSwarmState,
  getInboxCursor,
  incrementTokensUsedStep,
  listInboxEntriesSince,
  listTurnTelemetry,
  recordTurnTelemetryStep,
  resetSwarmStateClientForTests,
  setInboxCursor,
} from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

const dataDir = path.join(os.tmpdir(), `swarm-state-${process.pid}-${crypto.randomUUID()}`);
installNetworkEventsPlugin(createNetworkEventPersistencePlugin({ dataDir }));

const config: SwarmConfig = {
  sessionId: "session-budget",
  dataDir,
  goal: "test",
  agentCount: 2,
  maxTokenBudget: 100,
  contextMessageLimit: 5,
  model: { id: "test", maxSteps: 1 },
  roles: ["a", "b"],
};

const agents: AgentLoopState[] = [
  {
    did: "did:key:a",
    agentId: "did:key:a",
    role: "a",
    selfThreadId: "did:key:a-self",
    registeredStaticHash: "h1",
    turnCount: 0,
  },
  {
    did: "did:key:b",
    agentId: "did:key:b",
    role: "b",
    selfThreadId: "did:key:b-self",
    registeredStaticHash: "h2",
    turnCount: 0,
  },
];

test("swarm state tracks shared token budget and telemetry", async () => {
  resetSwarmStateClientForTests();
  const state = await createSwarmState(dataDir, config, agents);
  expect(await checkTokenBudgetRemainingStep(dataDir, state.id)).toBe(true);

  await incrementTokensUsedStep(dataDir, state.id, 60);
  await incrementTokensUsedStep(dataDir, state.id, 50);
  expect(await checkTokenBudgetRemainingStep(dataDir, state.id)).toBe(false);

  const agentA = agents[0];
  if (agentA === undefined) throw new Error("expected agent A");
  await recordTurnTelemetryStep(dataDir, state.id, {
    sessionId: config.sessionId,
    agentTurnIndex: 0,
    agentDid: agentA.did,
    agentRole: "a",
    runId: "run-1",
    capabilities: {
      staticHash: "s",
      runtimeHash: "r",
      toolRefs: [],
    },
    memoriesProvenanceRootHex: "",
    threadHashes: [],
    inboxEntryIds: [],
  });

  const telemetry = await listTurnTelemetry(dataDir, config.sessionId);
  expect(telemetry).toHaveLength(1);
  expect(telemetry[0]?.runId).toBe("run-1");
});

test("inbox entries and cursors persist in workflow db", async () => {
  resetSwarmStateClientForTests();
  const dataDir = path.join(os.tmpdir(), `swarm-inbox-${process.pid}-${crypto.randomUUID()}`);
  const sessionId = "session-inbox";
  const did = "did:key:agent";

  const first = await appendInboxEntry(dataDir, sessionId, did, {
    type: "inbox:notification",
    id: 1,
    did,
    notification: {
      kind: "inbox_post",
      payload: {
        postId: "atp0:1",
        postKind: "post",
        subscriptionMatches: [],
      },
    },
  });
  await appendInboxEntry(dataDir, sessionId, did, {
    type: "inbox:notification",
    id: 2,
    did,
    notification: {
      kind: "inbox_post",
      payload: {
        postId: "atp0:2",
        postKind: "post",
        subscriptionMatches: [],
      },
    },
  });

  await setInboxCursor(dataDir, sessionId, did, first.id);
  const sinceCursor = await listInboxEntriesSince(dataDir, sessionId, did, first.id);
  expect(sinceCursor).toHaveLength(1);
  expect(sinceCursor[0]?.id).not.toBe(first.id);
  expect(await getInboxCursor(dataDir, sessionId, did)).toBe(first.id);
});
