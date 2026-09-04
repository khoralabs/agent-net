import { describe, expect, test } from "bun:test";

import { createSseFanout } from "./sse-fanout.ts";

type Evt = { id: string; seq?: number; tag?: string };

/** Read SSE `data:` frames until `count` are seen or the reader is exhausted. */
async function readFrames(res: Response, count: number): Promise<unknown[]> {
  const reader = res.body?.getReader();
  if (reader === undefined) throw new Error("no body");
  const decoder = new TextDecoder();
  const frames: unknown[] = [];
  let buffered = "";
  while (frames.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const parts = buffered.split("\n\n");
    buffered = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      frames.push(JSON.parse(line.slice(6)));
    }
  }
  await reader.cancel();
  return frames;
}

function sseRequest(): { req: Request; abort: () => void } {
  const controller = new AbortController();
  return {
    req: new Request("http://localhost/events", { signal: controller.signal }),
    abort: () => controller.abort(),
  };
}

describe("createSseFanout", () => {
  test("delivers pushed events to subscribers and stops after unsubscribe", () => {
    const fanout = createSseFanout<Evt>();
    const seen: Evt[] = [];
    const unsubscribe = fanout.subscribe((event) => seen.push(event));

    fanout.push({ id: "a" });
    unsubscribe();
    fanout.push({ id: "b" });

    expect(seen).toEqual([{ id: "a" }]);
  });

  test("applies subscriber filters and isolates listener errors", () => {
    const fanout = createSseFanout<Evt>();
    const kept: Evt[] = [];
    fanout.subscribe(() => {
      throw new Error("bad client");
    });
    fanout.subscribe(
      (event) => kept.push(event),
      (event) => event.tag === "keep",
    );

    fanout.push({ id: "a", tag: "keep" });
    fanout.push({ id: "b", tag: "drop" });

    expect(kept).toEqual([{ id: "a", tag: "keep" }]);
  });

  test("caps the replay ring at ringSize", () => {
    const fanout = createSseFanout<Evt>({ ringSize: 2 });
    fanout.push({ id: "a" });
    fanout.push({ id: "b" });
    fanout.push({ id: "c" });
    expect(fanout.recent()).toEqual([{ id: "b" }, { id: "c" }]);
  });

  test("replays the ring then streams live events", async () => {
    const fanout = createSseFanout<Evt>({ keepAliveMs: 0 });
    fanout.push({ id: "a" });

    const { req, abort } = sseRequest();
    const res = fanout.sseResponse(req);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const framesPromise = readFrames(res, 2);
    await Bun.sleep(5);
    fanout.push({ id: "b" });

    expect(await framesPromise).toEqual([{ id: "a" }, { id: "b" }]);
    abort();
  });

  test("dedupes by eventId across replay, live push, and poll", async () => {
    const fanout = createSseFanout<Evt>({
      keepAliveMs: 0,
      eventId: (event) => event.id,
      seq: (event) => event.seq,
    });
    fanout.push({ id: "a", seq: 1 });

    const polled: number[] = [];
    const { req, abort } = sseRequest();
    const res = fanout.sseResponse(req, {
      poll: {
        intervalMs: 5,
        fetch: async (sinceSeq) => {
          polled.push(sinceSeq);
          return [
            { id: "a", seq: 1 },
            { id: "b", seq: 2 },
          ];
        },
      },
    });

    const framesPromise = readFrames(res, 2);
    await Bun.sleep(5);
    fanout.push({ id: "b", seq: 2 });

    expect(await framesPromise).toEqual([
      { id: "a", seq: 1 },
      { id: "b", seq: 2 },
    ]);
    // The first poll starts from the replayed event's sequence, not zero.
    expect(polled[0]).toBe(1);
    abort();
  });

  test("filters the stream per connection", async () => {
    const fanout = createSseFanout<Evt>({ keepAliveMs: 0 });
    const { req, abort } = sseRequest();
    const res = fanout.sseResponse(req, { filter: (event) => event.tag === "keep" });

    const framesPromise = readFrames(res, 1);
    await Bun.sleep(5);
    fanout.push({ id: "a", tag: "drop" });
    fanout.push({ id: "b", tag: "keep" });

    expect(await framesPromise).toEqual([{ id: "b", tag: "keep" }]);
    abort();
  });

  test("advances the poll cursor past events the filter drops", async () => {
    const fanout = createSseFanout<Evt>({
      keepAliveMs: 0,
      eventId: (event) => event.id,
      seq: (event) => event.seq,
    });
    const cursors: number[] = [];
    const { req, abort } = sseRequest();
    const res = fanout.sseResponse(req, {
      filter: (event) => event.tag === "keep",
      poll: {
        intervalMs: 5,
        fetch: async (sinceSeq) => {
          cursors.push(sinceSeq);
          return sinceSeq < 2 ? [{ id: "a", seq: 2, tag: "drop" }] : [];
        },
      },
    });

    await Bun.sleep(30);
    expect(cursors[0]).toBe(0);
    expect(cursors.slice(1).every((cursor) => cursor === 2)).toBe(true);
    abort();
    await res.body?.cancel();
  });

  test("cancelling the stream drops the subscription", async () => {
    const fanout = createSseFanout<Evt>({ keepAliveMs: 0 });
    const { req } = sseRequest();
    const res = fanout.sseResponse(req);

    await res.body?.cancel();
    fanout.push({ id: "a" });

    // A leaked subscriber would still be registered and receive the push.
    expect(fanout.recent()).toEqual([{ id: "a" }]);
  });

  test("an already-aborted request never subscribes or polls", async () => {
    const fanout = createSseFanout<Evt>({ keepAliveMs: 0 });
    const { req, abort } = sseRequest();
    abort();

    let polls = 0;
    const res = fanout.sseResponse(req, {
      poll: {
        intervalMs: 1,
        fetch: async () => {
          polls += 1;
          return [];
        },
      },
    });
    fanout.push({ id: "a" });
    await Bun.sleep(10);

    expect(polls).toBe(0);
    expect(await readFrames(res, 1)).toEqual([]);
  });

  test("skips poll ticks while a fetch is in flight", async () => {
    const fanout = createSseFanout<Evt>({ keepAliveMs: 0 });
    const { req, abort } = sseRequest();
    let inFlight = 0;
    let maxConcurrent = 0;

    const res = fanout.sseResponse(req, {
      poll: {
        intervalMs: 1,
        fetch: async () => {
          inFlight += 1;
          maxConcurrent = Math.max(maxConcurrent, inFlight);
          await Bun.sleep(15);
          inFlight -= 1;
          return [];
        },
      },
    });

    await Bun.sleep(40);
    expect(maxConcurrent).toBe(1);
    abort();
    await res.body?.cancel();
  });

  test("survives a poll source that throws", async () => {
    const fanout = createSseFanout<Evt>({ keepAliveMs: 0 });
    const { req, abort } = sseRequest();
    const res = fanout.sseResponse(req, {
      poll: {
        intervalMs: 5,
        fetch: async () => {
          throw new Error("plugin missing");
        },
      },
    });

    const framesPromise = readFrames(res, 1);
    await Bun.sleep(10);
    fanout.push({ id: "a" });

    expect(await framesPromise).toEqual([{ id: "a" }]);
    abort();
  });
});
