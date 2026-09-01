import {
  createNetworkEventPersistencePlugin,
  type NetworkEventPersistencePlugin,
} from "../core/plugin.ts";
import type { NetworkEventStore } from "../core/store.ts";
import { createSqliteNetworkEventStore } from "./sqlite-store.ts";

export type { NetworkEventPersistencePlugin } from "../core/plugin.ts";
export type { NetworkEventStore } from "../core/store.ts";
export {
  type CreateSqliteNetworkEventStoreOptions,
  createSqliteNetworkEventStore,
} from "./sqlite-store.ts";

export type CreateSqliteNetworkEventPersistencePluginOptions = {
  dataDir: string;
  store?: NetworkEventStore;
};

/**
 * Convenience: sqlite EventStore under `{dataDir}/workflow.db` + JSONL plugin.
 */
export function createSqliteNetworkEventPersistencePlugin(
  opts: CreateSqliteNetworkEventPersistencePluginOptions,
): NetworkEventPersistencePlugin {
  const store = opts.store ?? createSqliteNetworkEventStore({ dataDir: opts.dataDir });
  return createNetworkEventPersistencePlugin({ dataDir: opts.dataDir, store });
}
