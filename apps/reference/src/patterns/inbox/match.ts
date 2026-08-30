import type { PoolInboxEvent } from "@khoralabs/agent-net-harness";

export function inboxHasPost(events: readonly PoolInboxEvent[], postId: string): boolean {
  return events.some((e) => {
    if (e.type === "inbox:notification") {
      const n = e.notification as { kind: string; payload: { postId: string } };
      return n.kind === "inbox_post" && n.payload.postId === postId;
    }
    if (e.type === "inbox:drain") {
      return e.items.some((item) => {
        const proj = item.projection as Record<string, unknown> | null | undefined;
        return proj?.postId === postId;
      });
    }
    return false;
  });
}

function authorDidFromPostId(postId: string): string | undefined {
  const PREFIX = "atp0:";
  if (!postId.startsWith(PREFIX)) return undefined;
  try {
    const json = Buffer.from(postId.slice(PREFIX.length), "base64url").toString("utf8");
    const o = JSON.parse(json) as { p?: unknown };
    return typeof o.p === "string" && o.p.length > 0 ? o.p : undefined;
  } catch {
    return undefined;
  }
}

export function inboxPostAuthorDid(
  events: readonly PoolInboxEvent[],
  postId: string,
): string | undefined {
  for (const e of events) {
    if (e.type === "inbox:notification") {
      const n = e.notification as {
        kind: string;
        payload: { postId: string; authorPrincipalId?: string };
      };
      if (n.kind === "inbox_post" && n.payload.postId === postId) {
        return n.payload.authorPrincipalId ?? authorDidFromPostId(postId);
      }
    }
    if (e.type === "inbox:drain") {
      const found = e.items.some((item) => {
        const proj = item.projection as Record<string, unknown> | null | undefined;
        return proj?.postId === postId;
      });
      if (found) return authorDidFromPostId(postId);
    }
  }
  return undefined;
}

/** Extract all post IDs carried by a multiplex inbox event. */
export function inboxEventPostIds(event: PoolInboxEvent): string[] {
  if (event.type === "inbox:notification") {
    const n = event.notification as { kind: string; payload: { postId?: string } };
    if (n.kind === "inbox_post" && typeof n.payload.postId === "string") {
      return [n.payload.postId];
    }
    return [];
  }
  if (event.type === "inbox:drain") {
    const out: string[] = [];
    for (const item of event.items) {
      const proj = item.projection as Record<string, unknown> | null | undefined;
      const postId = proj?.postId;
      if (typeof postId === "string" && postId.length > 0) out.push(postId);
    }
    return out;
  }
  return [];
}

/** First post ID on an event, if any. */
export function inboxEventPostId(event: PoolInboxEvent): string | undefined {
  return inboxEventPostIds(event)[0];
}
