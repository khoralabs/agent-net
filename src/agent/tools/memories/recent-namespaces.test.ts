import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

import type { HarnessToolkitEnv } from "../types.ts";
import {
  clearRecentNamespacesProcessCache,
  createEphemeralRecentNamespacesTracker,
  formatRecentNamespacesInstruction,
  loadRecentNamespacesFromDisk,
  RECENT_NAMESPACES_TOP_K,
  recentNamespacesDiskPath,
  resolveRecentNamespacesTracker,
} from "./_helpers/recent-namespaces.ts";
import { memoriesToolkit } from "./_toolkit.ts";

afterEach(() => {
  clearRecentNamespacesProcessCache();
});

describe("recent namespaces tracker", () => {
  test("touch moves namespaces to the front and top respects limit", async () => {
    const tracker = await resolveRecentNamespacesTracker({ agentDid: "did:key:test" });
    for (let i = 1; i <= 10; i += 1) {
      tracker.touch(`ns-${i}`);
    }
    expect(tracker.top(RECENT_NAMESPACES_TOP_K)).toEqual([
      "ns-10",
      "ns-9",
      "ns-8",
      "ns-7",
      "ns-6",
      "ns-5",
      "ns-4",
      "ns-3",
    ]);
    tracker.touch("ns-1");
    expect(tracker.top(3)).toEqual(["ns-1", "ns-10", "ns-9"]);
  });

  test("persists and reloads from networkDataDir", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "recent-ns-"));
    try {
      const agentDid = "did:key:persist";
      const tracker = await resolveRecentNamespacesTracker({
        agentDid,
        networkDataDir: dataDir,
      });
      tracker.touch(["alpha", "beta"]);
      await tracker.persist();

      const diskPath = recentNamespacesDiskPath(dataDir, agentDid);
      const raw = await readFile(diskPath, "utf8");
      expect(JSON.parse(raw).namespaces).toEqual(["beta", "alpha"]);

      clearRecentNamespacesProcessCache();
      const reloaded = await resolveRecentNamespacesTracker({
        agentDid,
        networkDataDir: dataDir,
      });
      expect(reloaded.top()).toEqual(["beta", "alpha"]);
      expect(await loadRecentNamespacesFromDisk(dataDir, agentDid)).toEqual(["beta", "alpha"]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("process cache wins over disk when non-empty", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "recent-ns-cache-"));
    try {
      const agentDid = "did:key:cache";
      const first = await resolveRecentNamespacesTracker({
        agentDid,
        networkDataDir: dataDir,
      });
      first.touch("from-memory");
      await first.persist();

      const second = await resolveRecentNamespacesTracker({
        agentDid,
        networkDataDir: dataDir,
      });
      second.touch("newer");
      expect(second.top()).toEqual(["newer", "from-memory"]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("formatRecentNamespacesInstruction", () => {
    expect(formatRecentNamespacesInstruction([])).toBeUndefined();
    expect(formatRecentNamespacesInstruction(["a", "b"])).toBe("Recently used namespaces: a, b");
  });
});

describe("memories toolkit instruction injection", () => {
  test("injects recently used namespaces into evaluated instructions", async () => {
    const env: HarnessToolkitEnv = {
      skills: [],
      activatedSkillNames: new Set(),
      embeddingCache: new Map(),
      recentNamespaces: createEphemeralRecentNamespacesTracker(["notes", "inbox"]),
      memoriesClient: {
        search: async () => [],
        mergeMemory: async () => [],
        deleteMemory: async () => undefined,
        persistence: {
          listMemoryNamespaces: async () => ["inbox", "notes"],
        },
      } as unknown as RemoteMemoriesClientAsync,
    };

    const evaluated = await evaluateComposable(memoriesToolkit, { env });
    expect(evaluated.instructions).toContain("Recently used namespaces: notes, inbox");
    expect(evaluated.tools.listNamespaces).toBeDefined();
  });
});
