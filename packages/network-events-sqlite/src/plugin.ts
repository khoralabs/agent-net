import { appendFileSync, closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import type {
  ListNetworkEventsOptions,
  NetworkEvent,
  NetworkEventsPlugin,
} from "@khoralabs/agent-net-harness";

import { createSqliteNetworkEventStore } from "./sqlite-store.ts";
import type { NetworkEventStore } from "./store.ts";

export type CreateNetworkEventPersistencePluginOptions = {
  dataDir: string;
  /** Defaults to a sqlite store under `{dataDir}/workflow.db`. */
  store?: NetworkEventStore;
};

function networkEventsDir(dataDir: string): string {
  return path.join(dataDir, "network-events");
}

export function networkEventSessionJsonlPath(dataDir: string, sessionId: string): string {
  return path.join(networkEventsDir(dataDir), `${sessionId}.jsonl`);
}

export type NetworkEventPersistencePlugin = NetworkEventsPlugin & {
  readonly store: NetworkEventStore;
  readonly dataDir: string;
  sessionJsonlPath(sessionId: string): string;
};

/**
 * Reference network-events plugin: sqlite EventStore + per-session JSONL append.
 */
export function createNetworkEventPersistencePlugin(
  opts: CreateNetworkEventPersistencePluginOptions,
): NetworkEventPersistencePlugin {
  const store = opts.store ?? createSqliteNetworkEventStore({ dataDir: opts.dataDir });
  const writtenEventIds = new Set<string>();
  const jsonlFds = new Map<string, number>();

  function appendJsonlLine(sessionId: string, line: string): void {
    const target = networkEventSessionJsonlPath(opts.dataDir, sessionId);
    let fd = jsonlFds.get(sessionId);
    if (fd === undefined) {
      mkdirSync(path.dirname(target), { recursive: true });
      fd = openSync(target, "a");
      jsonlFds.set(sessionId, fd);
    }
    appendFileSync(fd, `${line}\n`);
  }

  return {
    store,
    dataDir: opts.dataDir,

    sessionJsonlPath(sessionId: string): string {
      return networkEventSessionJsonlPath(opts.dataDir, sessionId);
    },

    async onNetworkEvent(event: NetworkEvent): Promise<NetworkEvent | null> {
      const stored = await store.append(event);
      if (stored === null) return null;
      if (!writtenEventIds.has(stored.eventId)) {
        writtenEventIds.add(stored.eventId);
        appendJsonlLine(stored.sessionId, JSON.stringify(stored));
      }
      return stored;
    },

    listEvents(sessionId: string, listOpts?: ListNetworkEventsOptions): Promise<NetworkEvent[]> {
      return store.list(sessionId, listOpts);
    },

    close() {
      for (const fd of jsonlFds.values()) {
        closeSync(fd);
      }
      jsonlFds.clear();
      writtenEventIds.clear();
      store.close();
    },
  };
}
