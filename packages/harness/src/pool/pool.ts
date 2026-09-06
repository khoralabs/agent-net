import { rm } from "node:fs/promises";
import {
  generateIdentity,
  type IdentitySecret,
  type PersistableSigner,
} from "@khoralabs/did-key-identity";
import { KhoraClient } from "@khoralabs/khora-client";
import { AgentHandle } from "../agent/handle.ts";
import { loadHarnessIdentity, saveHarnessIdentity } from "./identity-wrap-key.ts";
import type { PerAgentInviteBank } from "./per-agent-invite-bank.ts";
import type { PoolAgentPage, PoolAgentQuery } from "./query.ts";
import { type AgentMemoriesFraming, AgentStore, type PoolAgentRegistry } from "./store.ts";

export type AgentCallback = (handle: AgentHandle) => Promise<void>;

export type SpawnAgentOptions = {
  externalId?: string;
  /** Registration invite token to consume even when the host does not require one. */
  inviteToken?: string;
  /** Withdraw a registration invite from this managed parent agent's bank. */
  inviteFromDid?: string;
};

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
  /** When set, agent identity files are sealed with AES-256-GCM. */
  identitySecret?: IdentitySecret;
  /**
   * When set, each spawn mints one invite (typically via Khora admin API)
   * and passes it to `register({ inviteToken })`.
   */
  mintInvite?: () => Promise<string>;
  /** Whether the Khora host rejects registration without an invite token. */
  invitesRequired?: boolean;
  /**
   * Stores registration-issued invite tokens per agent (encrypted).
   * Spawn can consume from a specified parent agent via `inviteFromDid`.
   */
  inviteBank?: PerAgentInviteBank;
  /** Fired after a new agent is registered and stored (e.g. bind inbox multiplex). */
  onMemberAdded?: (handle: AgentHandle) => Promise<void>;
  /** Fired before unregistering an agent (e.g. unbind inbox multiplex). */
  onMemberRemoving?: (did: string) => Promise<void>;
  /**
   * Optional injected agent registry (e.g. SQLite-backed).
   * When omitted, opens the legacy file-backed {@link AgentStore}.
   */
  agentRegistry?: PoolAgentRegistry;
};

export class ManagedAgentPool {
  readonly #store: PoolAgentRegistry;
  readonly #baseUrl: string;
  readonly #dataDir: string;
  readonly #identitySecret: IdentitySecret | undefined;
  readonly #mintInvite: (() => Promise<string>) | undefined;
  readonly #invitesRequired: boolean;
  readonly #inviteBank: PerAgentInviteBank | undefined;
  readonly #onMemberAdded: ((handle: AgentHandle) => Promise<void>) | undefined;
  readonly #onMemberRemoving: ((did: string) => Promise<void>) | undefined;

  private constructor(
    store: PoolAgentRegistry,
    baseUrl: string,
    dataDir: string,
    identitySecret: IdentitySecret | undefined,
    mintInvite: (() => Promise<string>) | undefined,
    invitesRequired: boolean,
    inviteBank: PerAgentInviteBank | undefined,
    onMemberAdded: ((handle: AgentHandle) => Promise<void>) | undefined,
    onMemberRemoving: ((did: string) => Promise<void>) | undefined,
  ) {
    this.#store = store;
    this.#baseUrl = baseUrl;
    this.#dataDir = dataDir;
    this.#identitySecret = identitySecret;
    this.#mintInvite = mintInvite;
    this.#invitesRequired = invitesRequired;
    this.#inviteBank = inviteBank;
    this.#onMemberAdded = onMemberAdded;
    this.#onMemberRemoving = onMemberRemoving;
  }

  /**
   * Open (or create) a pool. If `count` is set and fewer agents exist,
   * the shortfall is spawned before returning.
   */
  static async create(opts: ManagedAgentPoolOptions): Promise<ManagedAgentPool> {
    const store = opts.agentRegistry ?? (await AgentStore.open(opts.dataDir));
    const pool = new ManagedAgentPool(
      store,
      opts.baseUrl,
      opts.dataDir,
      opts.identitySecret,
      opts.mintInvite,
      opts.invitesRequired ?? false,
      opts.inviteBank,
      opts.onMemberAdded,
      opts.onMemberRemoving,
    );

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
   * Filtered / sorted / paginated pool inventory for host UIs.
   * Prefer over {@link list} when paging; `list` remains the unbounded DID scan for boot.
   */
  queryAgents(opts?: PoolAgentQuery): PoolAgentPage {
    return this.#store.query(opts);
  }

  /** Lookup agent DID by opaque external id, if linked. */
  getDidByExternalId(externalId: string): string | undefined {
    return this.#store.getByExternalId(externalId)?.did;
  }

  /** Lookup opaque external id linked to an agent DID, if any. */
  getExternalId(did: string): string | undefined {
    return this.#store.get(did)?.externalId;
  }

  /** Persist an opaque external id ↔ DID mapping on an existing pool agent. */
  async setExternalId(did: string, externalId: string): Promise<void> {
    await this.#store.setExternalId(did, externalId);
  }

  /** Clear the opaque external id mapping for an agent. */
  async clearExternalId(did: string): Promise<void> {
    await this.#store.clearExternalId(did);
  }

  /** Stored memories-framing prose overrides for an agent, if any. */
  getMemoriesFraming(did: string): AgentMemoriesFraming | undefined {
    return this.#store.get(did)?.memoriesFraming;
  }

  /** Persist or clear host-edited memories-framing prose (not derived namespaces). */
  async setMemoriesFraming(did: string, framing: AgentMemoriesFraming | undefined): Promise<void> {
    await this.#store.setMemoriesFraming(did, framing);
  }

  async #loadSigner(keyPath: string): Promise<PersistableSigner | undefined> {
    return loadHarnessIdentity(keyPath, this.#identitySecret);
  }

  /**
   * Generate a fresh identity, persist the key, register on the network,
   * and add to the pool. The optional callback receives a focused handle
   * immediately after registration — use it to perform per-agent setup
   * (e.g. initialising a memories database). Returns the new agent's DID.
   */
  async spawn(onSpawned?: AgentCallback, opts?: SpawnAgentOptions): Promise<string> {
    const externalId = opts?.externalId?.trim();
    if (externalId !== undefined && externalId.length > 0) {
      const existing = this.#store.getByExternalId(externalId);
      if (existing !== undefined) {
        throw new Error(`externalId ${externalId} is already linked to agent ${existing.did}`);
      }
    }

    const signer = await generateIdentity();
    const keyPath = AgentStore.keyPath(this.#dataDir, signer.did);
    await saveHarnessIdentity(keyPath, signer, this.#identitySecret);

    const client = new KhoraClient({ baseUrl: this.#baseUrl, signer });
    const username = `agent-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

    const explicitInvite = opts?.inviteToken?.trim();
    const inviteFromDid = opts?.inviteFromDid?.trim();
    if (
      explicitInvite !== undefined &&
      explicitInvite.length > 0 &&
      inviteFromDid !== undefined &&
      inviteFromDid.length > 0
    ) {
      throw new Error("spawn: pass inviteToken or inviteFromDid, not both");
    }

    let inviteToken =
      explicitInvite !== undefined && explicitInvite.length > 0 ? explicitInvite : undefined;
    let parentSigner: PersistableSigner | undefined;
    if (inviteToken === undefined && inviteFromDid !== undefined && inviteFromDid.length > 0) {
      const parent = this.#store.get(inviteFromDid);
      if (parent === undefined) {
        throw new Error(`spawn: invite parent ${inviteFromDid} is not managed by this pool`);
      }
      parentSigner = await this.#loadSigner(parent.keyPath);
      if (parentSigner === undefined) {
        throw new Error(`spawn: key file missing for invite parent ${inviteFromDid}`);
      }
      inviteToken = await this.#inviteBank?.take(parentSigner);
      if (inviteToken === undefined) {
        throw new Error(`spawn: invite parent ${inviteFromDid} has no available invite tokens`);
      }
    }
    if (inviteToken === undefined && this.#mintInvite !== undefined) {
      inviteToken = await this.#mintInvite();
    }
    if (inviteToken === undefined && this.#invitesRequired) {
      throw new Error("spawn: Khora host requires an invite, but no invite token is available");
    }

    let result: Awaited<ReturnType<KhoraClient["register"]>>;
    try {
      result = await client.register({
        metadata: { username },
        ...(inviteToken !== undefined ? { inviteToken } : {}),
      });
    } catch (error) {
      if (parentSigner !== undefined && inviteToken !== undefined) {
        await this.#inviteBank?.deposit(parentSigner, [inviteToken]);
      }
      throw error;
    }

    if (this.#inviteBank !== undefined && result.inviteTokens !== undefined) {
      await this.#inviteBank.deposit(signer, result.inviteTokens);
    }

    await this.#store.add({
      did: signer.did,
      keyPath,
      ...(externalId !== undefined && externalId.length > 0 ? { externalId } : {}),
    });

    const handle = new AgentHandle({
      signer,
      baseUrl: this.#baseUrl,
      keyPath,
      ...(externalId !== undefined && externalId.length > 0 ? { externalId } : {}),
    });
    await this.#onMemberAdded?.(handle);
    if (onSpawned !== undefined) {
      await onSpawned(handle);
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

    await this.#onMemberRemoving?.(did);

    const signer = await this.#loadSigner(record.keyPath);

    if (signer !== undefined) {
      if (onRemoving !== undefined) {
        await onRemoving(
          new AgentHandle({
            signer,
            baseUrl: this.#baseUrl,
            keyPath: record.keyPath,
            ...(record.externalId !== undefined ? { externalId: record.externalId } : {}),
          }),
        );
      }
      const client = new KhoraClient({ baseUrl: this.#baseUrl, signer });
      await client.unregister();
    }

    await this.#inviteBank?.clear(did);
    await rm(record.keyPath, { force: true });
    await this.#store.remove(did);
  }

  /**
   * Load a pool agent handle. Alias of {@link focus}.
   * For memories + social binding, use harness {@link NetworkHarnessAgentApi.get}.
   */
  async get(did: string, onFocused?: AgentCallback): Promise<AgentHandle> {
    return this.focus(did, onFocused);
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

    const signer = await this.#loadSigner(record.keyPath);
    if (signer === undefined) {
      throw new Error(`Key file missing for agent ${did} at ${record.keyPath}`);
    }

    const handle = new AgentHandle({
      signer,
      baseUrl: this.#baseUrl,
      keyPath: record.keyPath,
      ...(record.externalId !== undefined ? { externalId: record.externalId } : {}),
    });
    await onFocused?.(handle);
    return handle;
  }
}
