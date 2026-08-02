/**
 * Non-durable spawn-from-external orchestration.
 * Hosts wrap this sequence in durable workflow steps; this module owns the contract.
 */

import type { ExternalSource, ExternalSourceFraming } from "./external-source.ts";
import type { IntegrateMemoryEvent } from "./memory-event.ts";

export type SpawnFromExternalSourceParams = {
  externalId: string;
  agentDid?: string;
};

export type SpawnFromExternalSourceResult = {
  did: string;
  created: boolean;
  eventCount: number;
  correlationIds: string[];
  startedCount: number;
};

export type SpawnFromExternalSourceHost = {
  resolveAgent(externalId: string): Promise<{ did: string; created: boolean }>;
  applyFraming?(did: string, framing: ExternalSourceFraming): Promise<void>;
  enqueueEvents(events: IntegrateMemoryEvent[]): Promise<number>;
  /** Host-specific post-pull hook (e.g. ops external index). */
  afterPull?(args: { externalId: string; did: string; context: unknown }): Promise<void>;
};

/**
 * Pull external context, optionally frame + index, decompose, and enqueue integrate events.
 * Not a durable workflow — hosts reimplement as steps for durability.
 */
export async function runSpawnFromExternalSource<TContext>(
  source: ExternalSource<TContext>,
  host: SpawnFromExternalSourceHost,
  params: SpawnFromExternalSourceParams,
): Promise<SpawnFromExternalSourceResult> {
  const externalId = params.externalId.trim();
  if (externalId.length === 0) {
    throw new Error("externalId is required");
  }
  if (source.id.trim() !== externalId) {
    throw new Error(
      `ExternalSource.id (${source.id}) must match params.externalId (${externalId})`,
    );
  }

  let did: string;
  let created: boolean;
  const knownDid = params.agentDid?.trim();
  if (knownDid !== undefined && knownDid.length > 0) {
    did = knownDid;
    created = false;
  } else {
    const resolved = await host.resolveAgent(externalId);
    did = resolved.did;
    created = resolved.created;
  }

  const context = await source.pull();

  if (host.afterPull !== undefined) {
    await host.afterPull({ externalId, did, context });
  }

  if (source.framing !== undefined && host.applyFraming !== undefined) {
    await host.applyFraming(did, source.framing(context));
  }

  const events = source.decompose(context, { did, externalId });
  const startedCount = await host.enqueueEvents(events);

  return {
    did,
    created,
    eventCount: events.length,
    correlationIds: events.map((e) => e.correlationId),
    startedCount,
  };
}
