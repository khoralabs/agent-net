import { createSseFanout, type SseFanout } from "../sse/sse-fanout.ts";
import type { PoolInboxEvent } from "./pool-inbox.ts";

export type InboxFanout = SseFanout<PoolInboxEvent>;

/**
 * Fan pool inbox events out to SSE clients. Feed it from
 * `harness.subscribeInbox` and serve `sseResponse(req)` from the host route.
 */
export function createInboxFanout(options: { ringSize?: number } = {}): InboxFanout {
  return createSseFanout<PoolInboxEvent>({ ringSize: options.ringSize ?? 100 });
}
