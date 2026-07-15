/**
 * Inbox-discovery test:
 *   An agent with a standing subscription receives a post from a previously
 *   unknown peer. It extracts the author's identity from the live inbox
 *   notification and opens a Vellum OBP channel with them.
 *
 * This models one half of sovereign peer discovery: a peer you have never met
 * reaches your inbox because your subscription criteria matched their content.
 *
 * In production an agent would evaluate the post against its mandate —
 * checking provenance, topic relevance, reputation signals, and its own
 * resource constraints — before deciding whether to open a channel. Here the
 * decision is automatic: any matching post triggers a connection attempt.
 *
 * Attribution: the author's DID is carried in `authorPrincipalId` on the
 * live notification payload. It is also encoded in the post ID itself
 * (`atp0:` prefix), so the drain path derives it without a separate field.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import type { KhoraClientEvent } from "@khoralabs/khora-client";
import { type NetworkHarnessHandle, startNetworkHarness } from "../harness";
import { inboxHasPost, inboxPostAuthorDid } from "../lib/inbox";
import { resolveKhoraBaseUrlFromEnv } from "../lib/khora-base-url";
import { disconnectVellum, openVellumChain } from "../lib/vellum";
import { waitFor } from "../lib/wait-for";

const khoraBaseUrl = resolveKhoraBaseUrlFromEnv();
const describeHarness = khoraBaseUrl !== undefined ? describe : describe.skip;

const dataDir = path.join(os.tmpdir(), `khora-inbox-discovery-${process.pid}`);
let harness: NetworkHarnessHandle;

beforeAll(async () => {
  if (khoraBaseUrl === undefined) return;
  harness = await startNetworkHarness({ dataDir, khoraBaseUrl });
}, 30_000);

afterAll(() => harness?.stop());

describeHarness("inbox-based peer discovery", () => {
  test("agent discovers unknown peer via subscription match and opens OBP channel", async () => {
    const agentsDataDir = path.join(dataDir, "agents");

    // ── 1. Spawn two agents that do not know each other ──────────────────
    const aliceDid = await harness.pool.spawn();
    const bobDid = await harness.pool.spawn();

    const alice = await harness.pool.focus(aliceDid);
    const bob = await harness.pool.focus(bobDid);

    // ── 2. Alice declares intent: she wants posts about "obp-seeking" ────
    await alice.client.createSubscription({
      visibility: "public",
      search: { content: { text: "obp-seeking" } },
    });

    // ── 3. Alice opens her inbox before Bob posts (live notification path) ─
    const aliceEvents: KhoraClientEvent[] = [];
    const aliceConn = alice.connectInbox({ onEvent: (e) => aliceEvents.push(e) });

    // Allow inbox WS to establish.
    await Bun.sleep(500);

    // ── 4. Bob (unknown to Alice) broadcasts his intent ───────────────────
    //   In a real agent this post would be authored by a mandate-driven
    //   planner expressing what the agent is looking for.
    const post = await bob.client.createPost({
      body: "obp-seeking: open to bilateral OBP commitments on data-exchange terms",
    });
    expect(post.id).toBeTruthy();

    // ── 5. Alice's subscription fires; she learns Bob's DID ──────────────
    //   `authorPrincipalId` in the live inbox_post notification is the
    //   author's DID. The post ID also encodes it, so the drain path
    //   derives it without a separate attribution field.
    //
    //   In production, Alice would parse the post body, cross-reference it
    //   against her memory of trusted peers and past interactions, and only
    //   proceed if the content satisfies her mandate's connection criteria.
    await waitFor(() => inboxHasPost(aliceEvents, post.id), {
      timeoutMs: 12_000,
      label: "alice receives Bob's post in inbox",
    });

    const discoveredDid = inboxPostAuthorDid(aliceEvents, post.id);
    expect(discoveredDid).toBe(bobDid);

    // ── 6. Alice uses the discovered DID to open a Vellum OBP channel ────
    const vellumDataDir = path.join(dataDir, "vellum");
    const { initiatorVellum, responderVellum, sessionId } = await openVellumChain(alice, bob, {
      relayBaseUrl: harness.relayBaseUrl,
      agentsDataDir,
      vellumDataDir,
      initiatorLabel: "alice",
      responderLabel: "bob",
    });

    expect(sessionId).toBeTruthy();

    // ── cleanup ───────────────────────────────────────────────────────────
    disconnectVellum(initiatorVellum, responderVellum);
    aliceConn.close();
  }, 90_000);
});
