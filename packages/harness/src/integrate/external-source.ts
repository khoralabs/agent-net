/**
 * Host-facing pull seam for external systems that sync into the integrate pipeline.
 *
 * Other systems push events via `IntegrateMemoryEvent` (POST /api/memories/events).
 * An `ExternalSource` is for hosts that *pull* context from an external system
 * (e.g. company sync over HTTP), optionally derive framing, then decompose into
 * integrate events for enqueue.
 */

import type { IntegrateMemoryEvent } from "./memory-event.ts";

/** Memories framing projected from pulled external context. */
export type ExternalSourceFraming = {
  name?: string;
  about?: string;
  baseUnderstanding?: string;
  groundingNamespaces?: string[];
};

/** Target agent account for decomposed integrate events. */
export type ExternalSourceDecomposeTarget = {
  /** Agent DID / memories account ownerKey. */
  did: string;
  /** Opaque external link id when known (same as `ExternalSource.id` typically). */
  externalId?: string;
};

/**
 * Pull-based external sync adapter.
 * Hosts implement this for each external system; harness does not interpret `TContext`.
 */
export type ExternalSource<TContext = unknown> = {
  /** Opaque external identity (host maps platform ids here). */
  id: string;
  pull(): Promise<TContext>;
  framing?(ctx: TContext): ExternalSourceFraming;
  decompose(ctx: TContext, target: ExternalSourceDecomposeTarget): IntegrateMemoryEvent[];
};
