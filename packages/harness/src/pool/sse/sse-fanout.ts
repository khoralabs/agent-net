/**
 * Ring-buffer fan-out from an in-process event source to SSE clients.
 *
 * Console hosts stream pool inbox events and network events to browsers and
 * otherwise reimplement the same buffer, per-connection dedupe, catch-up poll,
 * and keepalive handling for each stream.
 */
const DEFAULT_RING_SIZE = 100;
const DEFAULT_KEEPALIVE_MS = 15_000;
const DEFAULT_POLL_MS = 2_000;
/** Cap per-connection dedupe so long-lived clients cannot grow without bound. */
const DEFAULT_SENT_CAP = 2_000;

export type SseFanoutOptions<T> = {
  /** Replayed to each new client. Default 100. */
  ringSize?: number;
  /** Stable event id; enables per-connection dedupe when provided. */
  eventId?: (event: T) => string;
  /** Monotonic sequence used as the catch-up poll cursor. */
  seq?: (event: T) => number | undefined;
  /** Keepalive comment interval. Default 15s; 0 disables. */
  keepAliveMs?: number;
  sentCap?: number;
};

export type SseResponseOptions<T> = {
  filter?: (event: T) => boolean;
  /**
   * Catch-up source polled while the stream is open, called with the highest
   * sequence sent so far. Needed when events may be persisted by another
   * process and never pushed through this fanout.
   */
  poll?: {
    intervalMs?: number;
    fetch: (sinceSeq: number) => Promise<readonly T[]>;
  };
};

export type SseFanout<T> = {
  /** Buffer an event and deliver it to matching live clients. */
  push(event: T): void;
  /** Buffered events, oldest first. */
  recent(): T[];
  subscribe(listener: (event: T) => void, filter?: (event: T) => boolean): () => void;
  sseResponse(req: Request, opts?: SseResponseOptions<T>): Response;
};

/** FIFO-capped id set: membership check plus insert, evicting the oldest. */
function createCappedIdSet(cap: number) {
  const set = new Set<string>();
  const order: string[] = [];
  return {
    has: (id: string) => set.has(id),
    add(id: string) {
      if (set.has(id)) return;
      set.add(id);
      order.push(id);
      while (order.length > cap) {
        const oldest = order.shift();
        if (oldest !== undefined) set.delete(oldest);
      }
    },
    clear() {
      set.clear();
      order.length = 0;
    },
  };
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

export function createSseFanout<T>(options: SseFanoutOptions<T> = {}): SseFanout<T> {
  const ringSize = options.ringSize ?? DEFAULT_RING_SIZE;
  const keepAliveMs = options.keepAliveMs ?? DEFAULT_KEEPALIVE_MS;
  const sentCap = options.sentCap ?? DEFAULT_SENT_CAP;

  const ring: T[] = [];
  const listeners = new Set<{
    listener: (event: T) => void;
    filter?: (event: T) => boolean;
  }>();

  function push(event: T): void {
    ring.push(event);
    if (ring.length > ringSize) ring.shift();
    for (const entry of listeners) {
      if (entry.filter !== undefined && !entry.filter(event)) continue;
      try {
        entry.listener(event);
      } catch {
        /* a failing client must not stall the fanout */
      }
    }
  }

  function subscribe(listener: (event: T) => void, filter?: (event: T) => boolean): () => void {
    const entry = filter !== undefined ? { listener, filter } : { listener };
    listeners.add(entry);
    return () => {
      listeners.delete(entry);
    };
  }

  function sseResponse(req: Request, opts: SseResponseOptions<T> = {}): Response {
    // Hoisted so `cancel` can tear down the timers and subscription that
    // `start` installs.
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const sent = createCappedIdSet(sentCap);
        const timers: Array<ReturnType<typeof setInterval>> = [];
        let sinceSeq = 0;
        let closed = false;
        let unsubscribe = () => {};

        cleanup = () => {
          if (closed) return;
          closed = true;
          for (const timer of timers) clearInterval(timer);
          unsubscribe();
          sent.clear();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        if (req.signal.aborted) {
          cleanup();
          return;
        }

        const send = (event: T) => {
          if (closed) return;
          // Advance the cursor before filtering, or a poll source whose events
          // this connection drops would re-fetch the same rows every tick.
          const seq = options.seq?.(event);
          if (seq !== undefined && seq > sinceSeq) sinceSeq = seq;
          if (opts.filter !== undefined && !opts.filter(event)) return;
          if (options.eventId !== undefined) {
            const id = options.eventId(event);
            if (sent.has(id)) return;
            sent.add(id);
          }
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            cleanup();
          }
        };

        for (const event of ring) send(event);
        unsubscribe = subscribe(send, opts.filter);

        const poll = opts.poll;
        if (poll !== undefined) {
          // Skip ticks while a fetch is in flight so a slow source cannot
          // stack up overlapping requests on the same cursor.
          let polling = false;
          const runPoll = async () => {
            if (closed || polling) return;
            polling = true;
            try {
              for (const event of await poll.fetch(sinceSeq)) send(event);
            } catch {
              /* persistence missing or transient — retried next tick */
            } finally {
              polling = false;
            }
          };
          void runPoll();
          timers.push(
            setInterval(() => {
              void runPoll();
            }, poll.intervalMs ?? DEFAULT_POLL_MS),
          );
        }

        if (keepAliveMs > 0) {
          timers.push(
            setInterval(() => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(": ping\n\n"));
              } catch {
                cleanup();
              }
            }, keepAliveMs),
          );
        }

        req.signal.addEventListener("abort", cleanup);
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  }

  return { push, recent: () => ring.slice(), subscribe, sseResponse };
}
