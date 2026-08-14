import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadNbcChainGraph } from "./nbc-chain-graph.ts";
import { createVellumChainSessionRegistry } from "./vellum-sessions.ts";

describe("loadNbcChainGraph", () => {
  test("throws when channel sqlite is missing", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "vellum-graph-"));
    await expect(loadNbcChainGraph({ dataDir, channelId: "missing-channel" })).rejects.toThrow();
  });
});

describe("createVellumChainSessionRegistry", () => {
  test("get/handleForDid/disconnect are no-ops when empty", () => {
    const registry = createVellumChainSessionRegistry();
    expect(registry.get("c1")).toBeNull();
    expect(registry.handleForDid("c1", "did:a", "did:b", "did:a")).toBeNull();
    registry.disconnect("c1");
    registry.clearForTests();
  });
});
