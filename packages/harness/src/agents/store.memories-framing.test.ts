import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentStore } from "./store.ts";

describe("AgentStore memoriesFraming", () => {
  const dirs: string[] = [];

  afterAll(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("persists and clears framing prose without grounding namespaces", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "agent-store-"));
    dirs.push(dir);
    const store = await AgentStore.open(dir);
    await store.add({
      did: "did:key:test",
      keyPath: AgentStore.keyPath(dir, "did:key:test"),
      externalId: "tenant-alpha",
    });

    await store.setMemoriesFraming("did:key:test", {
      about: "About the alpha workspace",
      baseUnderstanding: "Base facts",
    });
    expect(store.get("did:key:test")?.memoriesFraming).toEqual({
      about: "About the alpha workspace",
      baseUnderstanding: "Base facts",
    });

    const reopened = await AgentStore.open(dir);
    expect(reopened.get("did:key:test")?.memoriesFraming).toEqual({
      about: "About the alpha workspace",
      baseUnderstanding: "Base facts",
    });

    await reopened.setMemoriesFraming("did:key:test", undefined);
    expect(reopened.get("did:key:test")?.memoriesFraming).toBeUndefined();
  });
});
