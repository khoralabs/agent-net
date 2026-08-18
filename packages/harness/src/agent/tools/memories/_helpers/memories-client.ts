import {
  type LabelSchemaMap,
  mergeOntologies,
  type OntologyDefinition,
} from "@khoralabs/memories-node/ontology";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import {
  createBearerTokenAuthProvider,
  createDeferredRemoteMemoriesClientAsync,
  createRemoteMemoriesClientAsync,
  type MemoriesServiceFetch,
  type RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service/client";

import { minimalHarnessMemoriesOntology } from "./minimal-ontology.ts";

export type HarnessMemoriesOntology = OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;

export {
  HARNESS_MEMORY_EDGE_KIND,
  HARNESS_MEMORY_NODE_KIND,
  minimalHarnessMemoriesOntology,
} from "./minimal-ontology.ts";
export type { MemoriesServiceFetch };

/** Merge app ontology onto the harness Memory/References baseline (app wins on key collision). */
export function resolveHarnessMemoriesOntology(
  appOntology: HarnessMemoriesOntology,
): HarnessMemoriesOntology {
  return mergeOntologies(minimalHarnessMemoriesOntology, appOntology);
}

let installedFetch: MemoriesServiceFetch | undefined;

/** Host-provided signed fetch (RFC 9421) */
export function installHarnessMemoriesFetch(fetchFn: MemoriesServiceFetch): void {
  installedFetch = fetchFn;
}

export function harnessMemoriesFetch(): MemoriesServiceFetch {
  return installedFetch ?? fetch;
}

function remoteClientOptions(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
  ontology: HarnessMemoriesOntology;
  adminToken: string;
  fetch?: MemoriesServiceFetch;
}) {
  return {
    baseUrl: opts.baseUrl.replace(/\/$/, ""),
    database: opts.database,
    ontology: resolveHarnessMemoriesOntology(opts.ontology),
    auth: createBearerTokenAuthProvider(opts.adminToken),
    fetch: opts.fetch ?? harnessMemoriesFetch(),
  };
}

export async function createHarnessMemoriesClient(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
  ontology: HarnessMemoriesOntology;
  adminToken: string;
  fetch?: MemoriesServiceFetch;
}): Promise<RemoteMemoriesClientAsync> {
  return createRemoteMemoriesClientAsync(remoteClientOptions(opts));
}

/** Sync handle that lazily materializes via memories-service deferred remote client. */
export function createDeferredHarnessMemoriesClient(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
  ontology: HarnessMemoriesOntology;
  adminToken: string;
  fetch?: MemoriesServiceFetch;
}): RemoteMemoriesClientAsync {
  return createDeferredRemoteMemoriesClientAsync(remoteClientOptions(opts));
}

export function agentMemoriesDatabase(agentDid: string): MemoriesDatabaseId {
  return { kind: "account", ownerKey: agentDid };
}
