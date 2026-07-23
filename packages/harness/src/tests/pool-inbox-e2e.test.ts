/**
 * Live multiplex inbox e2e (requires running Khora + memories + relay):
 *   - One shared WebSocket for all pool agents (openSessionCount stays 1 across binds)
 *   - Live notification demux by event.did
 *   - Drain delivers after unbind → matching post → rebind
 *
 * Skip unless KHORA_BASE_URL, RELAY_BASE_URL, and MEMORIES_BASE_URL are set.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import type { KhoraClientEvent } from "@khoralabs/khora-client";
import { type NetworkHarnessHandle, startNetworkHarness } from "../harness.ts";
import { inboxHasPost } from "../lib/inbox.ts";
import { resolveKhoraBaseUrlFromEnv } from "../lib/khora-base-url.ts";
import { resolveMemoriesBaseUrlFromEnv } from "../lib/memories-base-url.ts";
import { resolveRelayBaseUrlFromEnv } from "../lib/relay-base-url.ts";
import { waitFor } from "../lib/wait-for.ts";
import { startTestChatHttp, type TestChatHttpHandle } from "./test-chat-http.ts";

const khoraBaseUrl = resolveKhoraBaseUrlFromEnv();
const relayBaseUrl = resolveRelayBaseUrlFromEnv();
const memoriesBaseUrl = resolveMemoriesBaseUrlFromEnv();
const describeHarness =
  khoraBaseUrl !== undefined && relayBaseUrl !== undefined && memoriesBaseUrl !== undefined
    ? describe
    : describe.skip;

const dataDir = path.join(os.tmpdir(), `khora-pool-inbox-e2e-${process.pid}`);
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

describeHarness("harness multiplex inbox", () => {
  test("one shared socket: live notify + drain after rebind", async () => {
    const aliceDid = await harness.pool.spawn();
    const bobDid = await harness.pool.spawn();
    const charlieDid = await harness.pool.spawn();

    const alice = await harness.pool.focus(aliceDid);
    const bob = await harness.pool.focus(bobDid);
    const charlie = await harness.pool.focus(charlieDid);

    await waitFor(
      () =>
        harness.poolInbox.isSessionOpen &&
        harness.poolInbox.list().includes(aliceDid) &&
        harness.poolInbox.list().includes(bobDid) &&
        harness.poolInbox.list().includes(charlieDid),
      { timeoutMs: 10_000, label: "pool inbox bound for 3 agents" },
    );

    // Incremental binds after the first open must not open extra sockets.
    expect(harness.poolInbox.openSessionCount).toBe(1);

    const byDid = new Map<string, KhoraClientEvent[]>();
    for (const did of [aliceDid, bobDid, charlieDid]) {
      byDid.set(did, []);
    }
    const unsub = harness.subscribeInbox((e) => {
      byDid.get(e.did)?.push(e);
    });

    const liveKeyword = `mux-live-${crypto.randomUUID().slice(0, 8)}`;
    await Promise.all([
      alice.client.createSubscription({
        visibility: "public",
        search: { content: { text: liveKeyword } },
      }),
      bob.client.createSubscription({
        visibility: "public",
        search: { content: { text: liveKeyword } },
      }),
    ]);
    await Bun.sleep(400);

    const livePost = await charlie.client.createPost({
      body: `${liveKeyword} live notification probe`,
    });

    await waitFor(() => inboxHasPost(byDid.get(aliceDid) ?? [], livePost.id), {
      timeoutMs: 12_000,
      label: "alice live inbox post",
    });
    await waitFor(() => inboxHasPost(byDid.get(bobDid) ?? [], livePost.id), {
      timeoutMs: 12_000,
      label: "bob live inbox post",
    });
    expect(inboxHasPost(byDid.get(charlieDid) ?? [], livePost.id)).toBe(false);
    expect(harness.poolInbox.openSessionCount).toBe(1);

    // Drain path: unbind alice, enqueue a match, rebind on the same socket.
    const drainKeyword = `mux-drain-${crypto.randomUUID().slice(0, 8)}`;
    await alice.client.createSubscription({
      visibility: "public",
      search: { content: { text: drainKeyword } },
    });
    await Bun.sleep(300);

    const aliceEventsBeforeDrain = byDid.get(aliceDid)?.length ?? 0;
    await harness.poolInbox.remove(aliceDid);
    expect(harness.poolInbox.list().includes(aliceDid)).toBe(false);
    expect(harness.poolInbox.isSessionOpen).toBe(true);
    expect(harness.poolInbox.openSessionCount).toBe(1);

    const drainPost = await charlie.client.createPost({
      body: `${drainKeyword} queued while alice unbound`,
    });
    await Bun.sleep(500);

    // Still unbound — should not have received the post yet.
    expect(
      inboxHasPost((byDid.get(aliceDid) ?? []).slice(aliceEventsBeforeDrain), drainPost.id),
    ).toBe(false);

    await harness.poolInbox.add(alice.signer);
    await waitFor(
      () =>
        harness.poolInbox.list().includes(aliceDid) &&
        inboxHasPost(byDid.get(aliceDid) ?? [], drainPost.id),
      { timeoutMs: 12_000, label: "alice drain/notify after rebind" },
    );

    // Same multiplex session; no reconnect required for bind/unbind.
    expect(harness.poolInbox.openSessionCount).toBe(1);

    unsub();
  }, 90_000);
});
