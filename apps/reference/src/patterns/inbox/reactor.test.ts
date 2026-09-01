import { describe, expect, test } from "bun:test";

import type { PoolInboxEvent } from "@khoralabs/agent-net";
import { inboxHasPost } from "./match.ts";
import { createInboxReactor } from "./reactor.ts";

function notification(did: string, postId: string): PoolInboxEvent {
  return {
    type: "inbox:notification",
    did,
    notification: {
      kind: "inbox_post",
      payload: { postId, authorPrincipalId: "did:key:author" },
    },
  } as unknown as PoolInboxEvent;
}

function drain(did: string, postIds: string[]): PoolInboxEvent {
  return {
    type: "inbox:drain",
    did,
    items: postIds.map((postId) => ({
      projection: { postId },
    })),
  } as unknown as PoolInboxEvent;
}

describe("createInboxReactor", () => {
  test("filters by did and dispatches", async () => {
    let push: ((e: PoolInboxEvent) => void) | undefined;
    const reactor = createInboxReactor((onEvent) => {
      push = onEvent;
      return () => {
        push = undefined;
      };
    });
    const seen: string[] = [];
    reactor.on({ dids: ["did:key:a"] }, (e) => {
      seen.push(e.did);
    });
    reactor.start();
    push?.(notification("did:key:b", "post-1"));
    push?.(notification("did:key:a", "post-1"));
    expect(seen).toEqual(["did:key:a"]);
  });

  test("waitForPost resolves on matching notification", async () => {
    let push: ((e: PoolInboxEvent) => void) | undefined;
    const reactor = createInboxReactor((onEvent) => {
      push = onEvent;
      return () => {
        push = undefined;
      };
    });
    reactor.start();
    const pending = reactor.waitForPost({ did: "did:key:a", postId: "p1", timeoutMs: 2000 });
    push?.(notification("did:key:a", "p1"));
    const event = await pending;
    expect(inboxHasPost([event], "p1")).toBe(true);
  });

  test("indexes all post ids from a drain batch", async () => {
    let push: ((e: PoolInboxEvent) => void) | undefined;
    const reactor = createInboxReactor((onEvent) => {
      push = onEvent;
      return () => {
        push = undefined;
      };
    });
    reactor.start();
    push?.(drain("did:key:a", ["p1", "p2"]));
    const a = await reactor.waitForPost({ did: "did:key:a", postId: "p1", timeoutMs: 500 });
    const b = await reactor.waitForPost({ did: "did:key:a", postId: "p2", timeoutMs: 500 });
    expect(inboxHasPost([a], "p1")).toBe(true);
    expect(inboxHasPost([b], "p2")).toBe(true);
  });

  test("waitForPost rejects on timeout", async () => {
    const reactor = createInboxReactor(() => () => {});
    reactor.start();
    await expect(
      reactor.waitForPost({ did: "did:key:a", postId: "missing", timeoutMs: 50 }),
    ).rejects.toThrow(/timeout/);
  });

  test("start cleanup allows restart", () => {
    let subs = 0;
    const reactor = createInboxReactor(() => {
      subs += 1;
      return () => {
        subs -= 1;
      };
    });
    const stop1 = reactor.start();
    expect(subs).toBe(1);
    stop1();
    expect(subs).toBe(0);
    const stop2 = reactor.start();
    expect(subs).toBe(1);
    stop2();
    expect(subs).toBe(0);
  });
});
