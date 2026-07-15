import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

import {
  type ListNetworkEventsOptions,
  networkEventId,
  persistNetworkEvent,
  queryNetworkEvents,
} from "../network/event-store.ts";
import type { NetworkAttribution, NetworkEvent } from "../network/types.ts";

export type { ListNetworkEventsOptions };

export type InitNetworkLogOptions = {
  dataDir: string;
  sessionId: string;
};

export type EmitNetworkEventInput = NetworkEvent & {
  dataDir: string;
};

const attributionStorage = new AsyncLocalStorage<NetworkAttribution | undefined>();

let logContext: InitNetworkLogOptions | undefined;
let jsonlFd: number | undefined;
let jsonlPath: string | undefined;
const writtenEventIds = new Set<string>();

function networkEventsDir(dataDir: string): string {
  return path.join(dataDir, "network-events");
}

export function networkEventSessionJsonlPath(dataDir: string, sessionId: string): string {
  return path.join(networkEventsDir(dataDir), `${sessionId}.jsonl`);
}

function appendJsonlLine(dataDir: string, sessionId: string, line: string): void {
  const target = jsonlPath ?? networkEventSessionJsonlPath(dataDir, sessionId);
  if (jsonlFd !== undefined) {
    appendFileSync(jsonlFd, `${line}\n`);
    return;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  appendFileSync(target, `${line}\n`);
}

/** Bind session context and open the session JSONL append handle for network events. */
export function initNetworkLog(opts: InitNetworkLogOptions): void {
  logContext = opts;

  mkdirSync(networkEventsDir(opts.dataDir), { recursive: true });
  jsonlPath = networkEventSessionJsonlPath(opts.dataDir, opts.sessionId);
  jsonlFd = openSync(jsonlPath, "a");
}

export function getNetworkLogContext(): InitNetworkLogOptions | undefined {
  return logContext;
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
  writtenEventIds.clear();
}

export function resetNetworkLogForTests(): void {
  closeNetworkLog();
}

export { networkEventId };
