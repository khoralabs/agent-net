/**
 * End-to-end network test:
 *   1. Three agents spawn, subscribe, and make posts → inbox notifications flow
 *   2. Two agents open a vellum relay channel and establish an OBP chain
 *   3. The initiator sends an offer turn and the graph reflects it
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import type { KhoraClientEvent } from "@khoralabs/khora-client";
import { type NetworkHarnessHandle, startNetworkHarness } from "../harness";
import { inboxHasPost } from "../lib/inbox";
import { resolveKhoraBaseUrlFromEnv } from "../lib/khora-base-url";
import { resolveMemoriesBaseUrlFromEnv } from "../lib/memories-base-url";
import { resolveRelayBaseUrlFromEnv } from "../lib/relay-base-url";
import { openVellumChain } from "../lib/vellum";
import { waitFor } from "../lib/wait-for";
import { startTestChatHttp, type TestChatHttpHandle } from "./test-chat-http.ts";

// ── harness ───────────────────────────────────────────────────────────────────

const khoraBaseUrl = resolveKhoraBaseUrlFromEnv();
const relayBaseUrl = resolveRelayBaseUrlFromEnv();
const memoriesBaseUrl = resolveMemoriesBaseUrlFromEnv();
const describeHarness =
  khoraBaseUrl !== undefined && relayBaseUrl !== undefined && memoriesBaseUrl !== undefined
    ? describe
    : describe.skip;

const dataDir = path.join(os.tmpdir(), `khora-e2e-${process.pid}`);
let harness: NetworkHarnessHandle;
let chatHttp: TestChatHttpHandle;

beforeAll(async () => {
  if (khoraBaseUrl === undefined || relayBaseUrl === undefined || memoriesBaseUrl === undefined) {
    return;
  }
  chatHttp = startTestChatHttp();
  harness = await startNetworkHarness({
    dataDir,
    chatBaseUrl: chatHttp.baseUrl,
    chatToken: chatHttp.token,
    khoraBaseUrl,
    relayBaseUrl,
    memoriesBaseUrl,
    memoriesAdminToken: process.env.MEMORIES_SERVICE_ADMIN_TOKEN?.trim() || "test-memories-token",
  });
}, 30_000);

afterAll(() => {
  harness?.stop();
  chatHttp?.stop();
});

// ── test ──────────────────────────────────────────────────────────────────────

describeHarness("multi-agent OBP network", () => {
  test("agents subscribe → post → notify → open vellum → chain → send offer", async () => {
    // Agents' key files live at this path (matches ManagedAgentPool internals)
    const agentsDataDir = path.join(dataDir, "agents");

    // ── 1. Spawn three agents ─────────────────────────────────────────────
    const aliceDid = await harness.pool.spawn();
    const bobDid = await harness.pool.spawn();
    const charlieDid = await harness.pool.spawn();

    const alice = await harness.pool.focus(aliceDid);
    const bob = await harness.pool.focus(bobDid);
    const charlie = await harness.pool.focus(charlieDid);

    // ── 2. Each agent subscribes to posts matching "obp-test" ────────────
    const subscription = {
      visibility: "public" as const,
      search: { content: { text: "obp-test" } },
    };
    await Promise.all([
      alice.client.createSubscription(subscription),
      bob.client.createSubscription(subscription),
      charlie.client.createSubscription(subscription),
    ]);

    // ── 3. Shared multiplex inbox (one WS for all harness agents) ────────
    const aliceEvents: KhoraClientEvent[] = [];
    const bobEvents: KhoraClientEvent[] = [];
    const charlieEvents: KhoraClientEvent[] = [];

    const unsubInbox = harness.subscribeInbox((e) => {
      if (e.did === aliceDid) aliceEvents.push(e);
      else if (e.did === bobDid) bobEvents.push(e);
      else if (e.did === charlieDid) charlieEvents.push(e);
    });

    // Brief settle so the pool WebSocket binds before posting
    await Bun.sleep(800);

    // ── 4. Charlie posts with "obp-test" keyword ─────────────────────────
    const post = await charlie.client.createPost({
      body: "obp-test handshake: looking for OBP peers",
    });
    expect(post.id).toBeTruthy();

    // ── 5. Alice and Bob receive inbox notifications for Charlie's post ───
    await waitFor(() => inboxHasPost(aliceEvents, post.id), {
      timeoutMs: 12_000,
      label: "alice inbox post",
    });
    await waitFor(() => inboxHasPost(bobEvents, post.id), {
      timeoutMs: 12_000,
      label: "bob inbox post",
    });

    // Charlie's own post doesn't generate a self-notification
    expect(inboxHasPost(charlieEvents, post.id)).toBe(false);

    // ── 6–9. Alice opens a Vellum channel with Bob and establishes an OBP chain
    const vellumDataDir = path.join(dataDir, "vellum");
    const {
      initiatorVellum: aliceVellum,
      responderVellum: bobVellum,
      sessionId,
    } = await openVellumChain(alice, bob, {
      relayBaseUrl: harness.relayBaseUrl,
      agentsDataDir,
      vellumDataDir,
      initiatorLabel: "alice",
      responderLabel: "bob",
    });
    expect(sessionId).toBeTruthy();

    // ── 10. Alice sends an offer turn on the chain ────────────────────────
    const offerTurn = {
      offer: {
        id: "offer-1",
        type: "service.slot",
        expires_turn: 100,
        expires_at_relay_ms: Date.now() + 60_000,
      },
      ports: [
        {
          id: "port-1",
          type: "slot",
          promise: "open",
          expires_turn: 100,
          expires_at_relay_ms: Date.now() + 60_000,
          bind_policy: null,
          ref: "",
        },
      ],
      bind_port_id: "",
      bind_payload: null,
    };
    await aliceVellum.sendTurn(sessionId, offerTurn);

    // Alice's graph should record the offer
    await waitFor(
      async () => {
        const snap = await aliceVellum.getChainSnapshot().catch(() => null);
        return (snap?.graphSummary?.offers ?? 0) >= 1;
      },
      { timeoutMs: 10_000, pollMs: 300, label: "alice graph has offer" },
    );

    // ── cleanup ───────────────────────────────────────────────────────────
    aliceVellum.disconnect();
    bobVellum.disconnect();
    unsubInbox();
  }, 90_000);
});
