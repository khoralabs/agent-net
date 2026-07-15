/**
 * Search-discovery test:
 *   An agent actively searches the network for relevant content, finds posts
 *   from unknown peers, and opens a Vellum OBP channel with one of them.
 *
 * This models the complement of inbox discovery: instead of waiting for content
 * to arrive, the agent goes looking. Post authorship is attributed automatically
 * via `authorDid` on each search hit — no out-of-band identification is required.
 *
 * In production an agent would score each search hit against its mandate —
 * assessing semantic relevance, provenance, prior interaction history, and
 * resource budget — before selecting whom to contact. Here the decision is
 * automatic: the first hit from a peer other than the searcher wins.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { type NetworkHarnessHandle, startNetworkHarness } from "../harness";
import { resolveKhoraBaseUrlFromEnv } from "../lib/khora-base-url";
import { disconnectVellum, openVellumChain } from "../lib/vellum";
import { waitFor } from "../lib/wait-for";

const khoraBaseUrl = resolveKhoraBaseUrlFromEnv();
const describeHarness = khoraBaseUrl !== undefined ? describe : describe.skip;

const dataDir = path.join(os.tmpdir(), `khora-search-discovery-${process.pid}`);
let harness: NetworkHarnessHandle;

beforeAll(async () => {
  if (khoraBaseUrl === undefined) return;
  harness = await startNetworkHarness({ dataDir, khoraBaseUrl });
}, 30_000);

afterAll(() => harness?.stop());

describeHarness("search-based peer discovery", () => {
  test("agent finds unknown peers via network search and opens OBP channel", async () => {
    const agentsDataDir = path.join(dataDir, "agents");

    // ── 1. Spawn two agents that do not know each other ──────────────────
    const aliceDid = await harness.pool.spawn();
    const bobDid = await harness.pool.spawn();

    const alice = await harness.pool.focus(aliceDid);
    const bob = await harness.pool.focus(bobDid);

    // ── 2. Bob publishes intent ───────────────────────────────────────────
    //   A real agent's planner would compose this from its mandate, expressing
    //   what it offers and its terms. `authorDid` is set automatically by the
    //   server from the authenticated principal — no self-identification needed.
    await bob.client.createPost({
      body: "obp-research: seeking collaborators on data-exchange protocols",
    });

    // Allow the post to be indexed in the memories store.
    await Bun.sleep(1_000);

    // ── 3. Alice proactively searches the network ─────────────────────────
    //   In production, Alice's mandate drives the query — she searches for
    //   topics relevant to her goals and ranks hits by relevance to her
    //   current context using her own memory embeddings. Here we use an
    //   exact keyword match as a stand-in for that judgement.
    let discoveredDid: string | undefined;

    await waitFor(
      async () => {
        const results = await alice.client.search({ q: "obp-research" });
        for (const hit of results.hits) {
          if (hit.original?.kind !== "post") continue;
          const authorDid = hit.original.authorDid;
          if (authorDid.length > 0 && authorDid !== aliceDid) {
            discoveredDid = authorDid;
            return true;
          }
        }
        return false;
      },
      { timeoutMs: 15_000, pollMs: 500, label: "alice finds Bob via search" },
    );

    expect(discoveredDid).toBe(bobDid);

    // ── 4. Alice opens a Vellum OBP channel with the discovered peer ──────
    //   In production, Alice would first verify the peer's post signature,
    //   check their reputation, and confirm alignment with her mandate before
    //   committing resources to opening a channel.
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
  }, 90_000);
});
