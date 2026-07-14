import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import pino from "pino";

import {
  type ListNetworkEventsOptions,
  networkEventId,
  persistNetworkEvent,
  queryNetworkEvents,
} from "../network/event-store.ts";
import type { NetworkAttribution, NetworkEvent, NetworkEventSource } from "../network/types.ts";

export type { ListNetworkEventsOptions };

export type InitNetworkLogOptions = {
  dataDir: string;
  sessionId: string;
};

export type EmitNetworkEventInput = NetworkEvent & {
  dataDir: string;
};

export type CreateNetworkLoggerOptions = {
  name: string;
  source: NetworkEventSource;
  agentDid?: string;
};

const attributionStorage = new AsyncLocalStorage<NetworkAttribution | undefined>();

let logContext: InitNetworkLogOptions | undefined;
let jsonlFd: number | undefined;
let jsonlPath: string | undefined;
let rootLogger: Logger | undefined;
let otelInitialized = false;
const writtenEventIds = new Set<string>();

function networkEventsDir(dataDir: string): string {
  return path.join(dataDir, "network-events");
}

function sessionJsonlPath(dataDir: string, sessionId: string): string {
  return path.join(networkEventsDir(dataDir), `${sessionId}.jsonl`);
}

function appendJsonlLine(dataDir: string, sessionId: string, line: string): void {
  const target = jsonlPath ?? sessionJsonlPath(dataDir, sessionId);
  if (jsonlFd !== undefined) {
    appendFileSync(jsonlFd, `${line}\n`);
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  appendFileSync(target, `${line}\n`);
}

function initOtelOnce(sessionId: string): void {
  if (otelInitialized) return;
  otelInitialized = true;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) return;

  const existing = process.env.OTEL_RESOURCE_ATTRIBUTES?.trim() ?? "";
  const sessionAttr = `swarm.session_id=${sessionId}`;
  process.env.OTEL_RESOURCE_ATTRIBUTES =
    existing.length > 0 ? `${existing},${sessionAttr}` : sessionAttr;

  void import("@khoralabs/observability/otel")
    .then(({ initOtel }) => {
      initOtel({ serviceName: "network-harness-swarm" });
    })
    .catch(() => undefined);
}

export function initNetworkLog(opts: InitNetworkLogOptions): Logger {
  logContext = opts;
  initOtelOnce(opts.sessionId);

  mkdirSync(networkEventsDir(opts.dataDir), { recursive: true });
  jsonlPath = sessionJsonlPath(opts.dataDir, opts.sessionId);
  jsonlFd = openSync(jsonlPath, "a");

  const streams: pino.StreamEntry[] = [
    { stream: pino.destination({ dest: jsonlFd, sync: true }) },
    { stream: pino.destination(2) },
  ];

  rootLogger = pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      name: "network-harness",
      mixin() {
        const attribution = attributionStorage.getStore();
        return {
          sessionId: opts.sessionId,
          ...(attribution !== undefined
            ? { attributionDigestHex: attribution.attributionDigestHex }
            : {}),
        };
      },
    },
    pino.multistream(streams),
  );

  return rootLogger;
}

export function getNetworkLogContext(): InitNetworkLogOptions | undefined {
  return logContext;
}

export function createNetworkLogger(opts: CreateNetworkLoggerOptions): Logger {
  const base = rootLogger ?? pino({ name: opts.name, level: process.env.LOG_LEVEL ?? "info" });
  return base.child({
    name: opts.name,
    source: opts.source,
    ...(opts.agentDid !== undefined ? { agentDid: opts.agentDid } : {}),
  });
}

export function getCurrentAttribution(): NetworkAttribution | undefined {
  return attributionStorage.getStore();
}

export function runWithAttribution<T>(attribution: NetworkAttribution | undefined, fn: () => T): T {
  return attributionStorage.run(attribution, fn);
}

export async function runWithAttributionAsync<T>(
  attribution: NetworkAttribution | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return attributionStorage.run(attribution, fn);
}

export async function emitNetworkEvent(input: EmitNetworkEventInput): Promise<NetworkEvent | null> {
  const { dataDir, ...event } = input;
  const stored = await persistNetworkEvent(dataDir, event);
  if (stored === null) return null;

  if (!writtenEventIds.has(stored.eventId)) {
    writtenEventIds.add(stored.eventId);
    appendJsonlLine(dataDir, stored.sessionId, JSON.stringify(stored));
  }

  return stored;
}

export async function listNetworkEvents(
  dataDir: string,
  sessionId: string,
  opts: ListNetworkEventsOptions = {},
): Promise<NetworkEvent[]> {
  return queryNetworkEvents(dataDir, sessionId, opts);
}

export function closeNetworkLog(): void {
  if (jsonlFd !== undefined) {
    closeSync(jsonlFd);
    jsonlFd = undefined;
  }
  jsonlPath = undefined;
  logContext = undefined;
  rootLogger = undefined;
  writtenEventIds.clear();
}

export function resetNetworkLogForTests(): void {
  closeNetworkLog();
  otelInitialized = false;
}

export { networkEventId };
