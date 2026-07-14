import { rm } from "node:fs/promises";
import { generateIdentity, loadIdentity, saveIdentity } from "@khoralabs/did-key-identity";
import { KhoraClient } from "@khoralabs/khora-client";

import { AgentHandle } from "./handle";
import { AgentStore } from "./store";

export type AgentCallback = (handle: AgentHandle) => Promise<void>;

export type ManagedAgentPoolOptions = {
  /** Directory where agents.json and per-agent key files are stored. */
  dataDir: string;
  /** Khora network base URL (e.g. "http://localhost:8787"). */
  baseUrl: string;
  /**
   * Ensure at least this many agents exist on startup. Any shortfall is
   * filled by spawning new agents (generating keys + registering on the network).
   */
  count?: number;
};

export class ManagedAgentPool {
  readonly #store: AgentStore;
  readonly #baseUrl: string;
  readonly #dataDir: string;

  private constructor(store: AgentStore, baseUrl: string, dataDir: string) {
    this.#store = store;
    this.#baseUrl = baseUrl;
    this.#dataDir = dataDir;
  }

  /**
   * Open (or create) a pool. If `count` is set and fewer agents exist,
   * the shortfall is spawned before returning.
   */
  static async create(opts: ManagedAgentPoolOptions): Promise<ManagedAgentPool> {
    const store = await AgentStore.open(opts.dataDir);
    const pool = new ManagedAgentPool(store, opts.baseUrl, opts.dataDir);

    if (opts.count !== undefined) {
      const shortfall = opts.count - store.all().length;
      for (let i = 0; i < shortfall; i++) {
        await pool.spawn();
      }
    }

    return pool;
  }

  /** All agent DIDs currently managed by this pool. */
  list(): readonly string[] {
    return this.#store.all().map((a) => a.did);
  }

  /**
   * Generate a fresh identity, persist the key, register on the network,
   * and add to the pool. The optional callback receives a focused handle
   * immediately after registration — use it to perform per-agent setup
   * (e.g. initialising a memories database). Returns the new agent's DID.
   */
  async spawn(onSpawned?: AgentCallback): Promise<string> {
    const signer = await generateIdentity();
    const keyPath = AgentStore.keyPath(this.#dataDir, signer.did);
    await saveIdentity(keyPath, signer);

    const client = new KhoraClient({ baseUrl: this.#baseUrl, signer });
    const username = `agent-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await client.register({ metadata: { username } });

    await this.#store.add({ did: signer.did, keyPath });

    if (onSpawned !== undefined) {
      await onSpawned(new AgentHandle({ signer, baseUrl: this.#baseUrl, keyPath }));
    }

    return signer.did;
  }

  /**
   * Unregister the agent from the network, delete its key file, and remove
   * it from the pool. The optional callback fires with a focused handle
   * before unregistering — use it to perform per-agent teardown
   * (e.g. closing a memories database). Throws if the DID is not managed
   * by this pool.
   */
  async remove(did: string, onRemoving?: AgentCallback): Promise<void> {
    const record = this.#store.get(did);
    if (record === undefined) {
      throw new Error(`Agent ${did} is not managed by this pool`);
    }

    const signer = await loadIdentity(record.keyPath);

    if (signer !== undefined) {
      if (onRemoving !== undefined) {
        await onRemoving(
          new AgentHandle({ signer, baseUrl: this.#baseUrl, keyPath: record.keyPath }),
        );
      }
      const client = new KhoraClient({ baseUrl: this.#baseUrl, signer });
      await client.unregister();
    }

    await rm(record.keyPath, { force: true });
    await this.#store.remove(did);
  }

  /**
   * Load the agent's persisted identity and return a handle that provides
   * an authenticated KhoraClient for that agent. The optional callback
   * receives the handle before it is returned — use it for lazy setup that
   * should run each time a handle is opened. Throws if the DID is not
   * managed by this pool or its key file is missing.
   */
  async focus(did: string, onFocused?: AgentCallback): Promise<AgentHandle> {
    const record = this.#store.get(did);
    if (record === undefined) {
      throw new Error(`Agent ${did} is not managed by this pool`);
    }

    const signer = await loadIdentity(record.keyPath);
    if (signer === undefined) {
      throw new Error(`Key file missing for agent ${did} at ${record.keyPath}`);
    }

    const handle = new AgentHandle({ signer, baseUrl: this.#baseUrl, keyPath: record.keyPath });
    await onFocused?.(handle);
    return handle;
  }
}
