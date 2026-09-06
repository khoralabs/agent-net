import type {
  InboxPostNotificationPayload,
  KhoraClientEvent,
  KhoraConnectionRequestPayload,
} from "@khoralabs/khora-client";

function postPayloadFromEvent(e: KhoraClientEvent): InboxPostNotificationPayload | undefined {
  if (e.type === "inbox:post") {
    return e.notification.payload;
  }
  if (e.type === "inbox:notification" && e.notification.kind === "inbox_post") {
    return e.notification.payload;
  }
  return undefined;
}

/** Extract a peer relationship request from a live or drained inbox event. */
export function inboxConnectionRequest(
  event: KhoraClientEvent,
): KhoraConnectionRequestPayload | undefined {
  if (event.type === "inbox:connection_request") {
    return event.notification.payload;
  }
  if (event.type === "inbox:notification" && event.notification.kind === "connection_request") {
    return event.notification.payload;
  }
  if (event.type === "inbox:drain") {
    for (const item of event.items) {
      const projection = item.projection as Record<string, unknown> | null | undefined;
      if (
        typeof projection?.channelId === "string" &&
        typeof projection.fromPrincipalId === "string" &&
        typeof projection.createdAtMs === "number"
      ) {
        return {
          channelId: projection.channelId,
          fromPrincipalId: projection.fromPrincipalId,
          createdAtMs: projection.createdAtMs,
        };
      }
    }
  }
  return undefined;
}

export function inboxHasConnectionRequest(
  events: readonly KhoraClientEvent[],
  channelId?: string,
): boolean {
  return events.some((event) => {
    const request = inboxConnectionRequest(event);
    return request !== undefined && (channelId === undefined || request.channelId === channelId);
  });
}

export function inboxHasPost(events: readonly KhoraClientEvent[], postId: string): boolean {
  return events.some((e) => {
    const payload = postPayloadFromEvent(e);
    if (payload !== undefined) {
      return payload.postId === postId;
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

/**
 * Decode the author DID from an address-encoded Khora post ID (`atp0:<base64url>`).
 * The DID is the `p` field in the encoded JSON — no server round-trip needed.
 */
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

/**
 * Extract the author's DID for a given post from inbox events.
 *
 * Checks derived `inbox:post`, legacy `inbox:notification`, and `inbox:drain` events.
 */
export function inboxPostAuthorDid(
  events: readonly KhoraClientEvent[],
  postId: string,
): string | undefined {
  for (const e of events) {
    const payload = postPayloadFromEvent(e);
    if (payload !== undefined && payload.postId === postId) {
      return payload.authorPrincipalId ?? authorDidFromPostId(postId);
    }
    if (e.type === "inbox:drain") {
      const found = e.items.some((item) => {
        const proj = item.projection as Record<string, unknown> | null | undefined;
        return proj?.postId === postId;
      });
      if (found) {
        return authorDidFromPostId(postId);
      }
    }
  }
  return undefined;
}

/** Extract all post IDs carried by a multiplex inbox event. */
export function inboxEventPostIds(event: KhoraClientEvent): string[] {
  const payload = postPayloadFromEvent(event);
  if (payload !== undefined) {
    return [payload.postId];
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
export function inboxEventPostId(event: KhoraClientEvent): string | undefined {
  return inboxEventPostIds(event)[0];
}
