import type { PoolInboxEvent } from "@khoralabs/agent-net-harness";

import { inboxEventPostIds, inboxHasPost } from "./match.ts";

export type InboxHandler = (event: PoolInboxEvent) => void | Promise<void>;

export type InboxFilter = {
  /** When set, only events for these DIDs. */
  dids?: ReadonlySet<string> | readonly string[];
  /** When set, only events that carry this post id. */
  postId?: string;
  /** When set, only these event type suffixes (e.g. "inbox:notification"). */
  types?: readonly PoolInboxEvent["type"][];
};

export type WaitForPostInput = {
  did: string;
  postId: string;
  timeoutMs?: number;
};

export type CreateInboxReactorOptions = {
  /** Max multiplex events retained for history / wait replay. Default 500. */
  maxHistory?: number;
};

export type InboxReactor = {
  on(filter: InboxFilter, handler: InboxHandler): () => void;
  waitForPost(input: WaitForPostInput): Promise<PoolInboxEvent>;
  /** Begin listening; returns stop/unsubscribe. Idempotent until stopped. */
  start(): () => void;
};

type SubscribeInbox = (onEvent: (event: PoolInboxEvent) => void) => () => void;

type Listener = {
  filter: InboxFilter;
  handler: InboxHandler;
};

function didSet(filter: InboxFilter): ReadonlySet<string> | undefined {
  if (filter.dids === undefined) return undefined;
  return filter.dids instanceof Set ? filter.dids : new Set(filter.dids);
}

function matchesFilter(event: PoolInboxEvent, filter: InboxFilter): boolean {
  const allowedDids = didSet(filter);
  if (allowedDids !== undefined && !allowedDids.has(event.did)) return false;
  if (filter.types !== undefined && filter.types.length > 0 && !filter.types.includes(event.type)) {
    return false;
  }
  if (filter.postId !== undefined) {
    if (!inboxHasPost([event], filter.postId)) return false;
  }
  return true;
}

/**
 * Domain-agnostic multiplex inbox fan-out: subscribe once, filter, dispatch, wait.
 * Promote candidate for a future `@khoralabs/agent-net-*` package.
 */
export function createInboxReactor(
  subscribe: SubscribeInbox,
  options?: CreateInboxReactorOptions,
): InboxReactor {
  const maxHistory = options?.maxHistory ?? 500;
  const listeners: Listener[] = [];
  const seenByDidPost = new Set<string>();
  const seenOrder: string[] = [];
  let unsubscribe: (() => void) | undefined;
  const history: PoolInboxEvent[] = [];

  function rememberSeen(key: string): void {
    if (seenByDidPost.has(key)) return;
    seenByDidPost.add(key);
    seenOrder.push(key);
    while (seenOrder.length > maxHistory) {
      const oldest = seenOrder.shift();
      if (oldest !== undefined) seenByDidPost.delete(oldest);
    }
  }

  function pushHistory(event: PoolInboxEvent): void {
    history.push(event);
    while (history.length > maxHistory) history.shift();
  }

  function dispatch(event: PoolInboxEvent): void {
    pushHistory(event);
    for (const postId of inboxEventPostIds(event)) {
      rememberSeen(`${event.did}\0${postId}`);
    }
    for (const { filter, handler } of [...listeners]) {
      if (!matchesFilter(event, filter)) continue;
      void Promise.resolve(handler(event)).catch((err) => {
        console.error("[inbox-reactor] handler error", err);
      });
    }
  }

  const reactor: InboxReactor = {
    on(filter, handler) {
      const entry: Listener = { filter, handler };
      listeners.push(entry);
      return () => {
        const i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    waitForPost(input) {
      const timeoutMs = input.timeoutMs ?? 30_000;
      const key = `${input.did}\0${input.postId}`;
      if (
        seenByDidPost.has(key) ||
        inboxHasPost(
          history.filter((e) => e.did === input.did),
          input.postId,
        )
      ) {
        const hit = history.find((e) => e.did === input.did && inboxHasPost([e], input.postId));
        if (hit !== undefined) return Promise.resolve(hit);
      }

      return new Promise<PoolInboxEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          off();
          reject(
            new Error(
              `inbox-reactor: timeout waiting for post ${input.postId} on did ${input.did} (${timeoutMs}ms)`,
            ),
          );
        }, timeoutMs);

        const off = reactor.on({ dids: [input.did], postId: input.postId }, (event) => {
          clearTimeout(timer);
          off();
          resolve(event);
        });
      });
    },

    start() {
      if (unsubscribe !== undefined) {
        return () => {
          unsubscribe?.();
          unsubscribe = undefined;
        };
      }
      unsubscribe = subscribe((event) => {
        dispatch(event);
      });
      return () => {
        unsubscribe?.();
        unsubscribe = undefined;
      };
    },
  };

  return reactor;
}
