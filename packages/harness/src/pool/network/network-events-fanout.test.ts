import { afterEach, describe, expect, test } from "bun:test";

import { installNetworkEventsPlugin } from "./events-plugin.ts";
import {
  agentNetworkEventFilter,
  networkEventsSseOptions,
  recordNetworkEvent,
} from "./network-events-fanout.ts";
import type { NetworkEvent } from "./types.ts";

function baseEvent(overrides: Partial<NetworkEvent> = {}): NetworkEvent {
  return {
    eventId: "e1",
    sessionId: "s1",
    tsMs: 1,
    source: "harness",
    kind: "test",
    ...overrides,
  };
}

/** Capture emitted events and serve a fixed catch-up list. */
function installCapturePlugin(list: NetworkEvent[] = []) {
  const emitted: NetworkEvent[] = [];
  installNetworkEventsPlugin({
    onNetworkEvent: async (event) => {
      emitted.push(event);
      return event;
    },
    listEvents: async () => list,
  });
  return emitted;
}

afterEach(() => {
  installNetworkEventsPlugin(undefined);
});

describe("agentNetworkEventFilter", () => {
  test("matches the acting agent and databases it owns", () => {
    const matches = agentNetworkEventFilter("did:key:alice");
    expect(matches(baseEvent({ agentDid: "did:key:alice" }))).toBe(true);
    expect(matches(baseEvent({ payload: { databaseOwnerKey: "did:key:alice" } }))).toBe(true);
    expect(matches(baseEvent({ agentDid: "did:key:bob" }))).toBe(false);
    expect(matches(baseEvent())).toBe(false);
  });
});

describe("recordNetworkEvent", () => {
  test("derives eventId and tsMs, and keeps optional fields it is given", async () => {
    const emitted = installCapturePlugin();
    const before = Date.now();

    const result = await recordNetworkEvent({
      sessionId: "s1",
      source: "harness",
      kind: "agent.turn",
      agentDid: "did:key:alice",
      runId: "run_1",
      message: "hello",
      level: "info",
    });

    expect(result).not.toBeNull();
    expect(emitted).toHaveLength(1);
    const event = emitted[0];
    expect(event?.eventId.startsWith("s1:agent.turn:run_1:did:key:alice:")).toBe(true);
    expect(event?.tsMs).toBeGreaterThanOrEqual(before);
    expect(event).toMatchObject({ message: "hello", level: "info", runId: "run_1" });
  });

  test("honors explicit eventId, tsMs, and extraId", async () => {
    const emitted = installCapturePlugin();

    await recordNetworkEvent({
      sessionId: "s1",
      source: "harness",
      kind: "k",
      eventId: "explicit",
      tsMs: 42,
    });
    await recordNetworkEvent({
      sessionId: "s1",
      source: "harness",
      kind: "k",
      extraId: "seed",
    });

    expect(emitted[0]).toMatchObject({ eventId: "explicit", tsMs: 42 });
    expect(emitted[1]?.eventId).toBe("s1:k::::seed");
  });

  test("omits absent optional fields entirely", async () => {
    const emitted = installCapturePlugin();
    await recordNetworkEvent({ sessionId: "s1", source: "harness", kind: "k" });
    expect(Object.keys(emitted[0] ?? {}).sort()).toEqual([
      "eventId",
      "kind",
      "sessionId",
      "source",
      "tsMs",
    ]);
  });

  test("returns null when no plugin is installed", async () => {
    expect(await recordNetworkEvent({ sessionId: "s1", source: "harness", kind: "k" })).toBeNull();
  });
});

describe("networkEventsSseOptions", () => {
  test("polls the installed plugin for a session's events", async () => {
    const catchUp = [baseEvent({ eventId: "e2", seq: 2 })];
    installCapturePlugin(catchUp);

    const opts = networkEventsSseOptions({ sessionId: "s1", pollIntervalMs: 10 });
    expect(opts.poll?.intervalMs).toBe(10);
    expect(await opts.poll?.fetch(1)).toEqual(catchUp);
  });

  test("passes a filter through when supplied", () => {
    const filter = agentNetworkEventFilter("did:key:alice");
    const opts = networkEventsSseOptions({ sessionId: "s1", filter });
    expect(opts.filter).toBe(filter);
  });
});
