import type { PersistableSigner } from "@khoralabs/did-key-identity";
import {
  type InboxWsHandlers,
  isDerivedInboxKindEvent,
  type KhoraClientEvent,
} from "@khoralabs/khora-client";

import type { AgentHandle, AgentInboxLifecycleHandler, InboxConnection } from "./handle.ts";

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export type PoolInboxEvent = Extract<KhoraClientEvent, { type: `inbox:${string}` }>;

export type PoolInboxOptions = {
  agents: readonly AgentHandle[];
  /** Called for each multiplex inbox event; `event.did` identifies the bound principal. */
  onEvent: (event: PoolInboxEvent) => void;
  onLifecycle?: AgentInboxLifecycleHandler;
};

type ConnectInboxMultiplex = (
  handlers: InboxWsHandlers,
  signers?: readonly PersistableSigner[],
) => Promise<{ close(): void }>;

/**
 * One reconnecting multiplex inbox stream for a deployment group / swarm.
 * Binds every agent DID on a single WebSocket and demuxes by `event.did`.
 */
export function connectPoolInbox(opts: PoolInboxOptions): InboxConnection {
  const agents = opts.agents;
  if (agents.length === 0) {
    throw new Error("connectPoolInbox: at least one agent required");
  }
  const primary = agents[0];
  if (primary === undefined) {
    throw new Error("connectPoolInbox: primary agent missing");
  }
  const signers: PersistableSigner[] = agents.map((a) => a.signer);
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const connectInbox = primary.client.connectInbox.bind(primary.client) as ConnectInboxMultiplex;

  let closed = false;
  let sessionClose: (() => void) | undefined;

  const unsub = primary.client.subscribe((event) => {
    if (!event.type.startsWith("inbox:")) return;
    if (isDerivedInboxKindEvent(event)) return;
    opts.onEvent(event as PoolInboxEvent);
  });

  void (async () => {
    let backoffMs = MIN_BACKOFF_MS;
    while (!closed) {
      let sessionEnded = false;
      try {
        const handle = await connectInbox(
          {
            onOpen: () => {
              backoffMs = MIN_BACKOFF_MS;
              opts.onLifecycle?.("connected");
            },
            onClose: () => {
              sessionEnded = true;
              opts.onLifecycle?.("disconnected");
            },
            onError: (err) => {
              sessionEnded = true;
              const error = err instanceof Error ? err.message : String(err);
              opts.onLifecycle?.("connect_failed", { error });
            },
          },
          signers,
        );
        sessionClose = handle.close;
        while (!closed && !sessionEnded) {
          await sleep(200);
        }
        handle.close();
        sessionClose = undefined;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        opts.onLifecycle?.("connect_failed", { error });
      }
      if (closed) break;
      opts.onLifecycle?.("reconnecting", { backoffMs });
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  })();

  return {
    close() {
      closed = true;
      sessionClose?.();
      unsub();
      opts.onLifecycle?.("stopped");
    },
  };
}
