/**
 * End-to-end network test:
 *   1. Three agents spawn, subscribe, and make posts → inbox notifications flow
 *   2. Two agents open a vellum relay channel and establish an OBP chain
 *   3. The initiator sends an offer turn and the graph reflects it
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { createMemoryChatPersistence } from "@khoralabs/chat-persistence";
import type { KhoraClientEvent } from "@khoralabs/khora-client";
import { type NetworkHarnessHandle, startNetworkHarness } from "../harness";
import { inboxHasPost } from "../lib/inbox";
import { resolveKhoraBaseUrlFromEnv } from "../lib/khora-base-url";
import { resolveMemoriesBaseUrlFromEnv } from "../lib/memories-base-url";
import { resolveRelayBaseUrlFromEnv } from "../lib/relay-base-url";
import { openVellumChain } from "../lib/vellum";
import { waitFor } from "../lib/wait-for";

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

beforeAll(async () => {
  if (khoraBaseUrl === undefined || relayBaseUrl === undefined || memoriesBaseUrl === undefined) {
    return;
  }
  harness = await startNetworkHarness({
    dataDir,
    chatPersistence: createMemoryChatPersistence(),
    khoraBaseUrl,
    relayBaseUrl,
    memoriesBaseUrl,
  });
}, 30_000);

afterAll(() => harness?.stop());

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

    // ── 3. Connect inboxes ────────────────────────────────────────────────
    const aliceEvents: KhoraClientEvent[] = [];
    const bobEvents: KhoraClientEvent[] = [];
    const charlieEvents: KhoraClientEvent[] = [];

    const aliceConn = alice.connectInbox({ onEvent: (e) => aliceEvents.push(e) });
    const bobConn = bob.connectInbox({ onEvent: (e) => bobEvents.push(e) });
    const charlieConn = charlie.connectInbox({ onEvent: (e) => charlieEvents.push(e) });

    // Brief settle so WebSocket connections establish before posting
    await Bun.sleep(800);

    // ── 4. Charlie posts with "obp-test" keyword ─────────────────────────
    const post = await charlie.client.createPost({
      body: "obp-test handshake: looking for OBP peers",
    });
    expect(post.id).toBeTruthy();

    // Allow the server to process the post and fan-out to Alice & Bob's inboxes
    await Bun.sleep(500);

    // Reconnect Alice & Bob's inbox WS so the drain picks up the new subscription match
    aliceConn.close();
    bobConn.close();
    const aliceConn2 = alice.connectInbox({ onEvent: (e) => aliceEvents.push(e) });
    const bobConn2 = bob.connectInbox({ onEvent: (e) => bobEvents.push(e) });

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
    aliceConn2.close();
    bobConn2.close();
    charlieConn.close();
  }, 90_000);
});
