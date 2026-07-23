import { expect, test } from "bun:test";

import {
  emitNetworkEvent,
  installNetworkEventsPlugin,
  listNetworkEvents,
  type NetworkEvent,
  type NetworkEventsPlugin,
  networkEventId,
} from "../network/index.ts";
import {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getNetworkSessionContext,
} from "./network-log.ts";

test("emitNetworkEvent delegates to installed plugin and list reads from it", async () => {
  const stored: NetworkEvent[] = [];
  const plugin: NetworkEventsPlugin = {
    async onNetworkEvent(event) {
      const withSeq = { ...event, seq: stored.length + 1 };
      stored.push(withSeq);
      return withSeq;
    },
    async listEvents(sessionId, opts = {}) {
      return stored.filter((event) => {
        if (event.sessionId !== sessionId) return false;
        if (opts.kind !== undefined && event.kind !== opts.kind) return false;
        return true;
      });
    },
  };

  installNetworkEventsPlugin(plugin);
  const sessionId = "session-hook";
  const emitted = await emitNetworkEvent({
    eventId: networkEventId({ sessionId, kind: "harness.started" }),
    sessionId,
    tsMs: Date.now(),
    source: "harness",
    kind: "harness.started",
  });

  expect(emitted?.seq).toBe(1);
  expect(await listNetworkEvents(sessionId)).toHaveLength(1);

  installNetworkEventsPlugin(undefined);
  expect(
    await emitNetworkEvent({
      eventId: "noop",
      sessionId,
      tsMs: Date.now(),
      source: "harness",
      kind: "harness.stopped",
    }),
  ).toBeNull();
  await expect(listNetworkEvents(sessionId)).rejects.toThrow(/not configured/);
});

test("bindNetworkSessionContext stores session id without dataDir", () => {
  clearNetworkSessionContext();
  bindNetworkSessionContext({ sessionId: "s1" });
  expect(getNetworkSessionContext()).toEqual({ sessionId: "s1" });
  clearNetworkSessionContext();
  expect(getNetworkSessionContext()).toBeUndefined();
});
