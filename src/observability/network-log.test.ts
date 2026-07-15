import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetNetworkEventStoreForTests } from "../network/event-store.ts";
import { buildNetworkAttribution } from "./attribution-digest.ts";
import {
  closeNetworkLog,
  emitNetworkEvent,
  initNetworkLog,
  listNetworkEvents,
  networkEventId,
  resetNetworkLogForTests,
} from "./network-log.ts";

const dataDir = path.join(os.tmpdir(), `network-log-${process.pid}-${crypto.randomUUID()}`);

test("network events order by seq and dedupe on replay", async () => {
  resetNetworkEventStoreForTests();
  resetNetworkLogForTests();
  const sessionId = "session-order";

  initNetworkLog({ dataDir, sessionId });

  const first = await emitNetworkEvent({
    dataDir,
    eventId: networkEventId({
      sessionId,
      kind: "agent.turn.start",
      runId: "run-a",
      agentDid: "did:key:a",
      turnIndex: 0,
    }),
    sessionId,
    tsMs: Date.now(),
    source: "agent",
    kind: "agent.turn.start",
    agentDid: "did:key:a",
    runId: "run-a",
  });
  const second = await emitNetworkEvent({
    dataDir,
    eventId: networkEventId({
      sessionId,
      kind: "agent.turn.start",
      runId: "run-b",
      agentDid: "did:key:b",
      turnIndex: 0,
    }),
    sessionId,
    tsMs: Date.now(),
    source: "agent",
    kind: "agent.turn.start",
    agentDid: "did:key:b",
    runId: "run-b",
  });
  const replay = await emitNetworkEvent({
    dataDir,
    eventId: networkEventId({
      sessionId,
      kind: "agent.turn.start",
      runId: "run-a",
      agentDid: "did:key:a",
      turnIndex: 0,
    }),
    sessionId,
    tsMs: Date.now(),
    source: "agent",
    kind: "agent.turn.start",
    agentDid: "did:key:a",
    runId: "run-a",
  });

  expect(first?.seq).toBe(1);
  expect(second?.seq).toBe(2);
  expect(replay).toBeNull();

  const events = await listNetworkEvents(dataDir, sessionId);
  expect(events).toHaveLength(2);
  expect(events[0]?.seq).toBe(1);
  expect(events[1]?.seq).toBe(2);

  const jsonl = readFileSync(path.join(dataDir, "network-events", `${sessionId}.jsonl`), "utf8");
  expect(jsonl.trim().split("\n")).toHaveLength(2);

  closeNetworkLog();
});

test("turn completed events include attribution digest", async () => {
  resetNetworkEventStoreForTests();
  resetNetworkLogForTests();
  const sessionId = "session-attribution";

  const attribution = buildNetworkAttribution({
    capabilities: {
      staticHash: "static",
      runtimeHash: "runtime",
      invocationHash: "invocation",
      toolRefs: [{ toolKey: "sendThreadMessage", toolHash: "toolhash" }],
    },
    memoriesProvenanceRootHex: "memroot",
    threadHashes: [{ threadId: "thread-1", headLineageHash: "lineage" }],
  });

  await emitNetworkEvent({
    dataDir,
    eventId: networkEventId({
      sessionId,
      kind: "agent.turn.completed",
      runId: "run-1",
      agentDid: "did:key:a",
      turnIndex: 0,
    }),
    sessionId,
    tsMs: Date.now(),
    source: "agent",
    kind: "agent.turn.completed",
    agentDid: "did:key:a",
    runId: "run-1",
    attribution,
    payload: {
      agentTurnIndex: 0,
      inboxEntryIds: [],
      capabilities: {
        staticHash: "static",
        runtimeHash: "runtime",
        invocationHash: "invocation",
        toolRefs: [{ toolKey: "sendThreadMessage", toolHash: "toolhash" }],
      },
    },
  });

  const events = await listNetworkEvents(dataDir, sessionId, { kind: "agent.turn.completed" });
  expect(events).toHaveLength(1);
  expect(events[0]?.attribution?.attributionDigestHex).toHaveLength(64);
  expect(events[0]?.attribution?.threadHashes[0]?.threadId).toBe("thread-1");
});
