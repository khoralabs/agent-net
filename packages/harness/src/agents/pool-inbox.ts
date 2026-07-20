import type { PersistableSigner } from "@khoralabs/did-key-identity";
import {
  type InboxWsHandlers,
  isDerivedInboxKindEvent,
  KhoraClient,
  type KhoraClientEvent,
} from "@khoralabs/khora-client";

import type { AgentHandle, AgentInboxLifecycleHandler, InboxConnection } from "./handle.ts";

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export type PoolInboxEvent = Extract<KhoraClientEvent, { type: `inbox:${string}` }>;

/**
 * Multiplex inbox session handle (khora-client ≥0.1.2). Declared locally so harness
 * typechecks before the published package is upgraded in every environment.
 */
export type InboxConnectionHandle = {
  close(): void;
  bind(signers: readonly PersistableSigner[]): Promise<void>;
  unbind(dids: readonly string[]): Promise<void>;
};

export type OpenPoolInboxSession = (
  signers: readonly PersistableSigner[],
  handlers: InboxWsHandlers,
) => Promise<InboxConnectionHandle>;

export type HarnessPoolInboxOptions = {
  /** Khora host base URL used to open the multiplex WebSocket. */
  khoraBaseUrl: string;
  /**
   * Optional injector for tests — default opens `KhoraClient.connectInbox` with all
   * current membership signers.
   */
  openSession?: OpenPoolInboxSession;
};

type ConnectInboxWithBind = (
  handlers: InboxWsHandlers,
  signers?: readonly PersistableSigner[],
) => Promise<InboxConnectionHandle>;

/**
 * Harness-owned multiplex inbox: one reconnecting socket, membership updated via
 * {@link HarnessPoolInbox.add} / {@link HarnessPoolInbox.remove}.
 */
export class HarnessPoolInbox {
  readonly #baseUrl: string;
  readonly #openSession: OpenPoolInboxSession;
  readonly #membership = new Map<string, PersistableSigner>();
  readonly #listeners = new Set<(event: PoolInboxEvent) => void>();
  #closed = false;
  #loopRunning = false;
  #session: InboxConnectionHandle | undefined;
  #clientUnsub: (() => void) | undefined;

  constructor(opts: HarnessPoolInboxOptions) {
    this.#baseUrl = opts.khoraBaseUrl.trim().replace(/\/$/, "");
    this.#openSession =
      opts.openSession ??
      ((signers, handlers) => {
        const primary = signers[0];
        if (primary === undefined) {
          throw new Error("HarnessPoolInbox: openSession requires at least one signer");
        }
        const client = new KhoraClient({ baseUrl: this.#baseUrl, signer: primary });
        this.#clientUnsub?.();
        this.#clientUnsub = client.subscribe((event) => {
          if (!event.type.startsWith("inbox:")) return;
          if (isDerivedInboxKindEvent(event)) return;
          this.#fanout(event as PoolInboxEvent);
        });
        const connect = client.connectInbox.bind(client) as ConnectInboxWithBind;
        return connect(handlers, signers);
      });
  }

  /** Fan-out live/drain inbox events to a consumer. Returns unsubscribe. */
  subscribe(listener: (event: PoolInboxEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Current bound membership DIDs. */
  list(): readonly string[] {
    return [...this.#membership.keys()];
  }

  /**
   * Add a principal to the pool. Starts the multiplex session when membership
   * becomes non-empty; otherwise sends an incremental bind on the open socket.
   */
  async add(signer: PersistableSigner): Promise<void> {
    if (this.#closed) return;
    this.#membership.set(signer.did, signer);
    if (this.#session !== undefined) {
      await this.#session.bind([signer]);
      return;
    }
    this.#ensureLoop();
  }

  /**
   * Drop a principal from the pool. Unbinds on the live socket; closes the
   * session when membership becomes empty.
   */
  async remove(did: string): Promise<void> {
    this.#membership.delete(did);
    if (this.#session !== undefined) {
      await this.#session.unbind([did]).catch(() => {});
    }
    if (this.#membership.size === 0) {
      this.#tearDownSession();
    }
  }

  /** Stop reconnect loop and close the socket. */
  close(): void {
    this.#closed = true;
    this.#membership.clear();
    this.#listeners.clear();
    this.#tearDownSession();
  }

  #fanout(event: PoolInboxEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        /* consumer errors must not break the pool */
      }
    }
  }

  #tearDownSession(): void {
    this.#clientUnsub?.();
    this.#clientUnsub = undefined;
    this.#session?.close();
    this.#session = undefined;
  }

  #ensureLoop(): void {
    if (this.#loopRunning || this.#closed) return;
    this.#loopRunning = true;
    void this.#runLoop();
  }

  async #runLoop(): Promise<void> {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    let backoffMs = MIN_BACKOFF_MS;

    while (!this.#closed) {
      if (this.#membership.size === 0) {
        this.#loopRunning = false;
        return;
      }

      const signers = [...this.#membership.values()];
      if (signers[0] === undefined) {
        this.#loopRunning = false;
        return;
      }

      let sessionEnded = false;
      try {
        const handle = await this.#openSession(signers, {
          onOpen: () => {
            backoffMs = MIN_BACKOFF_MS;
          },
          onClose: () => {
            sessionEnded = true;
          },
          onError: () => {
            sessionEnded = true;
          },
        });
        this.#session = handle;
        const bound = new Set(signers.map((s) => s.did));
        const extras = [...this.#membership.values()].filter((s) => !bound.has(s.did));
        if (extras.length > 0) {
          await handle.bind(extras).catch(() => {});
        }

        while (!this.#closed && !sessionEnded && this.#membership.size > 0) {
          await sleep(200);
        }
        this.#tearDownSession();
      } catch {
        this.#tearDownSession();
      }

      if (this.#closed || this.#membership.size === 0) break;
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }

    this.#loopRunning = false;
    if (!this.#closed && this.#membership.size > 0) {
      this.#ensureLoop();
    }
  }
}

export type PoolInboxOptions = {
  agents: readonly AgentHandle[];
  onEvent: (event: PoolInboxEvent) => void;
  onLifecycle?: AgentInboxLifecycleHandler;
};

/**
 * Ad-hoc reconnecting multiplex for a fixed agent list (tests / one-shot tools).
 * Prefer {@link HarnessPoolInbox} for harness-owned membership.
 */
export function connectPoolInbox(opts: PoolInboxOptions): InboxConnection {
  if (opts.agents.length === 0) {
    throw new Error("connectPoolInbox: at least one agent required");
  }
  const primary = opts.agents[0];
  if (primary === undefined) {
    throw new Error("connectPoolInbox: primary agent missing");
  }
  const pool = new HarnessPoolInbox({ khoraBaseUrl: primary.baseUrl });
  const unsub = pool.subscribe(opts.onEvent);
  void (async () => {
    for (const agent of opts.agents) {
      await pool.add(agent.signer);
    }
    opts.onLifecycle?.("connected");
  })().catch((e) => {
    const error = e instanceof Error ? e.message : String(e);
    opts.onLifecycle?.("connect_failed", { error });
  });
  return {
    close() {
      unsub();
      pool.close();
      opts.onLifecycle?.("stopped");
    },
  };
}
