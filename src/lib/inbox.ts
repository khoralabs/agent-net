import type { KhoraClientEvent } from "@khoralabs/khora-client";

export function inboxHasPost(events: KhoraClientEvent[], postId: string): boolean {
  return events.some((e) => {
    if (e.type === "inbox:notification") {
      const n = e.notification as { kind: string; payload: { postId: string } };
      return n.kind === "inbox_post" && n.payload.postId === postId;
    }
    if (e.type === "inbox:drain") {
      // Subscription fan-outs arrive via drain on WS connect
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
 * Checks both live notifications (`inbox:notification`, which carry `authorPrincipalId`
 * directly) and drain events (`inbox:drain`, where the DID is decoded from the post ID).
 */
export function inboxPostAuthorDid(events: KhoraClientEvent[], postId: string): string | undefined {
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
      if (found) {
        // DID is encoded in the post ID itself — no separate attribution field needed.
        return authorDidFromPostId(postId);
      }
    }
  }
  return undefined;
}
