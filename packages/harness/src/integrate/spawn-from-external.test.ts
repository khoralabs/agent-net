import { describe, expect, test } from "bun:test";

import type { ExternalSource } from "./external-source.ts";
import type { IntegrateMemoryEvent } from "./memory-event.ts";
import { runSpawnFromExternalSource } from "./spawn-from-external.ts";

type FakeCtx = { label: string };

function fakeSource(id: string): ExternalSource<FakeCtx> {
  return {
    id,
    async pull() {
      return { label: `ctx-${id}` };
    },
    framing(ctx) {
      return { name: ctx.label, about: `about ${ctx.label}` };
    },
    decompose(ctx, target) {
      const event: IntegrateMemoryEvent = {
        kind: "interaction",
        ownerKey: target.did,
        namespace: "_root_",
        correlationId: `corr:${id}`,
        occurredAtMs: 1,
        payload: { label: ctx.label, externalId: target.externalId },
        text: ctx.label,
      };
      return [event];
    },
  };
}

describe("runSpawnFromExternalSource", () => {
  test("resolves agent, pulls, frames, enqueues", async () => {
    const framingCalls: Array<{ did: string; name?: string }> = [];
    const afterPullCalls: unknown[] = [];
    let enqueued: IntegrateMemoryEvent[] = [];

    const result = await runSpawnFromExternalSource(
      fakeSource("ext-1"),
      {
        async resolveAgent(externalId) {
          expect(externalId).toBe("ext-1");
          return { did: "did:key:agent", created: true };
        },
        async applyFraming(did, framing) {
          framingCalls.push({ did, name: framing.name });
        },
        async afterPull(args) {
          afterPullCalls.push(args);
        },
        async enqueueEvents(events) {
          enqueued = events;
          return events.length;
        },
      },
      { externalId: "ext-1" },
    );

    expect(result).toEqual({
      did: "did:key:agent",
      created: true,
      eventCount: 1,
      correlationIds: ["corr:ext-1"],
      startedCount: 1,
    });
    expect(framingCalls).toEqual([{ did: "did:key:agent", name: "ctx-ext-1" }]);
    expect(afterPullCalls).toHaveLength(1);
    expect(enqueued[0]?.ownerKey).toBe("did:key:agent");
    expect(enqueued[0]?.payload.externalId).toBe("ext-1");
  });

  test("uses known agentDid without resolveAgent", async () => {
    let resolveCalled = false;
    const result = await runSpawnFromExternalSource(
      fakeSource("ext-2"),
      {
        async resolveAgent() {
          resolveCalled = true;
          return { did: "unused", created: true };
        },
        async enqueueEvents(events) {
          return events.length;
        },
      },
      { externalId: "ext-2", agentDid: "did:key:known" },
    );
    expect(resolveCalled).toBe(false);
    expect(result.did).toBe("did:key:known");
    expect(result.created).toBe(false);
  });

  test("rejects empty externalId", async () => {
    await expect(
      runSpawnFromExternalSource(
        fakeSource("x"),
        {
          async resolveAgent() {
            return { did: "d", created: false };
          },
          async enqueueEvents() {
            return 0;
          },
        },
        { externalId: "  " },
      ),
    ).rejects.toThrow(/externalId/);
  });

  test("rejects source.id mismatch", async () => {
    await expect(
      runSpawnFromExternalSource(
        fakeSource("a"),
        {
          async resolveAgent() {
            return { did: "d", created: false };
          },
          async enqueueEvents() {
            return 0;
          },
        },
        { externalId: "b" },
      ),
    ).rejects.toThrow(/must match/);
  });
});
