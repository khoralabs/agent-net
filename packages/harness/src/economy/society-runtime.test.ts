import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSocietyRuntime } from "./society-runtime.ts";
import {
  claimActorWake,
  enqueueActorWake,
  initializeSocietyState,
  listActorWakes,
  resetSocietyStateForTests,
} from "./society-state.ts";
import type { SocietyConfig } from "./society-types.ts";

const dirs: string[] = [];

function config(overrides: Partial<SocietyConfig> = {}): SocietyConfig {
  const dataDir = mkdtempSync(path.join(tmpdir(), "agent-net-society-"));
  dirs.push(dataDir);
  return {
    sessionId: crypto.randomUUID(),
    dataDir,
    actorDids: ["did:a", "did:b"],
    maxTokenBudget: 100,
    maxActorTurns: 10,
    cadenceMs: 0,
    ...overrides,
  };
}

afterEach(() => {
  resetSocietyStateForTests();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("society runtime", () => {
  test("serializes each actor while running different actors concurrently", async () => {
    const cfg = config({ maxConcurrentActors: 2 });
    const active = new Set<string>();
    let simultaneous = 0;
    let maxSimultaneous = 0;
    let completed = 0;
    const seenPayloads: Array<{ actorDid: string; payload: unknown }> = [];
    const runtime = createSocietyRuntime({
      config: cfg,
      pollMs: 2,
      scenario: {
        id: "test",
        observe: async ({ actorDid, wake }) => {
          seenPayloads.push({ actorDid, payload: wake.payload });
          return wake.payload;
        },
        shouldTerminate: async () => completed === 6,
      },
      runTurn: async ({ actorDid }) => {
        expect(active.has(actorDid)).toBeFalse();
        active.add(actorDid);
        simultaneous++;
        maxSimultaneous = Math.max(maxSimultaneous, simultaneous);
        await Bun.sleep(5);
        simultaneous--;
        active.delete(actorDid);
        completed++;
        return { tokensUsed: 3 };
      },
    });

    await runtime.start();
    await Promise.all([
      runtime.deliverEvent("did:a", { private: "a1" }, "event-a1"),
      runtime.deliverEvent("did:a", { private: "a2" }, "event-a2"),
      runtime.deliverEvent("did:b", { private: "b1" }, "event-b1"),
      runtime.deliverEvent("did:b", { private: "b2" }, "event-b2"),
    ]);
    const result = await runtime.runUntilDone();

    expect(result).toMatchObject({ turnsCompleted: 6, tokensUsed: 18, termination: "scenario" });
    expect(maxSimultaneous).toBe(2);
    expect(seenPayloads).toContainEqual({ actorDid: "did:a", payload: { private: "a1" } });
    expect(seenPayloads).not.toContainEqual({ actorDid: "did:b", payload: { private: "a1" } });
  });

  test("deduplicates delivery and recovers an interrupted running wake", async () => {
    const cfg = config();
    await initializeSocietyState(cfg);
    const first = await enqueueActorWake(cfg, {
      actorDid: "did:a",
      reason: "event",
      payload: { postId: "p1" },
      dedupeKey: "post:p1",
    });
    const duplicate = await enqueueActorWake(cfg, {
      actorDid: "did:a",
      reason: "event",
      payload: { postId: "p1" },
      dedupeKey: "post:p1",
    });
    expect(duplicate.id).toBe(first.id);
    expect(await claimActorWake(cfg.dataDir, first.id)).toBeTrue();

    let completed = 0;
    const runtime = createSocietyRuntime({
      config: cfg,
      pollMs: 2,
      scenario: {
        id: "recovery",
        observe: async ({ wake }) => wake.payload,
        shouldTerminate: async () => completed === 3,
      },
      runTurn: async () => {
        completed++;
        return { tokensUsed: 1 };
      },
    });
    const result = await runtime.runUntilDone();
    const wakes = await listActorWakes(cfg.dataDir, cfg.sessionId, "did:a");

    expect(result.turnsCompleted).toBe(3);
    expect(wakes.filter((wake) => wake.dedupeKey === "post:p1")).toHaveLength(1);
    expect(wakes.find((wake) => wake.id === first.id)?.attempts).toBe(2);
  });

  test("stop aborts a turn and leaves its wake pending for restart", async () => {
    const cfg = config();
    const runtime = createSocietyRuntime({
      config: cfg,
      pollMs: 2,
      scenario: {
        id: "stop",
        observe: async () => ({}),
        shouldTerminate: async () => false,
      },
      runTurn: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          setTimeout(() => resolve({ tokensUsed: 1 }), 1_000);
        }),
    });

    await runtime.start();
    await Bun.sleep(5);
    await runtime.stop();
    const wakes = (
      await Promise.all(cfg.actorDids.map((did) => listActorWakes(cfg.dataDir, cfg.sessionId, did)))
    ).flat();
    expect(
      wakes.filter((wake) => wake.reason === "initial").every((wake) => wake.status === "pending"),
    ).toBeTrue();
  });

  test("coalesces concurrent starts and does not start work after termination", async () => {
    const cfg = config({ maxConcurrentActors: 1 });
    let prepares = 0;
    let turns = 0;
    const runtime = createSocietyRuntime({
      config: cfg,
      pollMs: 2,
      scenario: {
        id: "termination",
        prepare: async () => {
          prepares++;
          await Bun.sleep(2);
        },
        observe: async () => ({}),
        shouldTerminate: async () => turns >= 1,
      },
      runTurn: async () => {
        turns++;
        return { tokensUsed: 1 };
      },
    });

    await Promise.all([runtime.start(), runtime.start()]);
    const result = await runtime.runUntilDone();

    expect(prepares).toBe(1);
    expect(turns).toBe(1);
    expect(result.termination).toBe("scenario");
  });

  test("serializes external protocol work with the actor decision lane", async () => {
    const cfg = config();
    let releaseActor!: () => void;
    const actorStarted = Promise.withResolvers<void>();
    const actorRelease = new Promise<void>((resolve) => {
      releaseActor = resolve;
    });
    const runtime = createSocietyRuntime({
      config: cfg,
      pollMs: 2,
      scenario: {
        id: "protocol-lane",
        observe: async () => ({}),
        shouldTerminate: async () => false,
      },
      runTurn: async ({ actorDid }) => {
        if (actorDid === "did:a") {
          actorStarted.resolve();
          await actorRelease;
        }
        return { tokensUsed: 1 };
      },
    });
    await runtime.start();
    await actorStarted.promise;

    let protocolStarted = false;
    const protocol = runtime.runActorTask("did:a", async () => {
      protocolStarted = true;
    });
    await Bun.sleep(5);
    expect(protocolStarted).toBeFalse();
    releaseActor();
    await protocol;
    expect(protocolStarted).toBeTrue();

    await expect(
      runtime.runActorTask("did:a", () => {
        throw new Error("sync failure");
      }),
    ).rejects.toThrow("sync failure");
    await expect(runtime.runActorTask("did:a", async () => "released")).resolves.toBe("released");
    await runtime.stop();
  });

  test("failed model turns consume the actor turn limit", async () => {
    const cfg = config({ actorDids: ["did:a"], maxActorTurns: 2 });
    let attempts = 0;
    const runtime = createSocietyRuntime({
      config: cfg,
      pollMs: 2,
      scenario: {
        id: "failure-limit",
        observe: async () => ({}),
        afterTurn: async () => {
          if (attempts < 2) await runtime.requestWake("did:a");
        },
        shouldTerminate: async () => false,
      },
      runTurn: async () => {
        attempts++;
        throw new Error("model unavailable");
      },
    });

    const result = await runtime.runUntilDone();
    expect(result).toMatchObject({ turnsCompleted: 2, tokensUsed: 0, termination: "turn-limit" });
    expect(attempts).toBe(2);
  });

  test("checks scenario termination after a failed turn", async () => {
    const cfg = config({ actorDids: ["did:a"], maxActorTurns: 3 });
    let failed = false;
    const runtime = createSocietyRuntime({
      config: cfg,
      scenario: {
        id: "failure-termination",
        observe: async () => ({}),
        afterTurn: async () => {
          failed = true;
        },
        shouldTerminate: async () => failed,
      },
      runTurn: async () => {
        throw new Error("model unavailable");
      },
    });

    expect(await runtime.runUntilDone()).toMatchObject({
      turnsCompleted: 1,
      termination: "scenario",
    });
  });
});
