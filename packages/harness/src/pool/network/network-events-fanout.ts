import { createSseFanout, type SseFanout, type SseResponseOptions } from "../sse/sse-fanout.ts";
import { networkEventId } from "./event-id.ts";
import { emitNetworkEvent, listNetworkEvents } from "./events-plugin.ts";
import type { NetworkEvent } from "./types.ts";

const RING_SIZE = 200;

export type NetworkEventsFanout = SseFanout<NetworkEvent>;

/** Match events attributed to an agent, including memories it owns. */
export function agentNetworkEventFilter(did: string): (event: NetworkEvent) => boolean {
  return (event) => {
    if (event.agentDid === did) return true;
    const owner = event.payload?.databaseOwnerKey;
    return typeof owner === "string" && owner === did;
  };
}

/**
 * Fan network events out to SSE clients, deduped by `eventId` and backfilled
 * from the installed network-events plugin so events persisted by other
 * processes still reach live clients.
 */
export function createNetworkEventsFanout(
  options: { ringSize?: number } = {},
): NetworkEventsFanout {
  return createSseFanout<NetworkEvent>({
    ringSize: options.ringSize ?? RING_SIZE,
    eventId: (event) => event.eventId,
    seq: (event) => event.seq,
  });
}

/** Build the `sseResponse` options that poll a session's persisted events. */
export function networkEventsSseOptions(input: {
  sessionId: string;
  filter?: (event: NetworkEvent) => boolean;
  pollIntervalMs?: number;
}): SseResponseOptions<NetworkEvent> {
  return {
    ...(input.filter !== undefined ? { filter: input.filter } : {}),
    poll: {
      ...(input.pollIntervalMs !== undefined ? { intervalMs: input.pollIntervalMs } : {}),
      fetch: (sinceSeq) => listNetworkEvents(input.sessionId, { sinceSeq }),
    },
  };
}

export type RecordNetworkEventInput = Omit<NetworkEvent, "eventId" | "sessionId" | "tsMs"> & {
  sessionId: string;
  tsMs?: number;
  eventId?: string;
  /** Disambiguator folded into the derived `eventId`. Defaults to `tsMs`. */
  extraId?: string;
};

/**
 * Persist a network event, deriving `eventId` and `tsMs` when the caller does
 * not supply them. Returns `null` when no events plugin is installed.
 */
export async function recordNetworkEvent(
  input: RecordNetworkEventInput,
): Promise<NetworkEvent | null> {
  const tsMs = input.tsMs ?? Date.now();
  const eventId =
    input.eventId ??
    networkEventId({
      sessionId: input.sessionId,
      kind: input.kind,
      ...(input.agentDid !== undefined ? { agentDid: input.agentDid } : {}),
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      extra: input.extraId ?? String(tsMs),
    });

  return emitNetworkEvent({
    eventId,
    sessionId: input.sessionId,
    tsMs,
    source: input.source,
    kind: input.kind,
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
    ...(input.agentDid !== undefined ? { agentDid: input.agentDid } : {}),
    ...(input.agentRole !== undefined ? { agentRole: input.agentRole } : {}),
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
    ...(input.attribution !== undefined ? { attribution: input.attribution } : {}),
  });
}
