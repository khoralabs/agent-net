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
  type RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service/client";

import { minimalHarnessMemoriesOntology } from "./minimal-ontology.ts";

export type HarnessMemoriesOntology = OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;

export {
  HARNESS_MEMORY_EDGE_KIND,
  HARNESS_MEMORY_NODE_KIND,
  minimalHarnessMemoriesOntology,
} from "./minimal-ontology.ts";

/** Merge app ontology onto the harness Memory/References baseline (app wins on key collision). */
export function resolveHarnessMemoriesOntology(
  appOntology: HarnessMemoriesOntology,
): HarnessMemoriesOntology {
  return mergeOntologies(minimalHarnessMemoriesOntology, appOntology);
}

function remoteClientOptions(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
  ontology: HarnessMemoriesOntology;
  adminToken: string;
}) {
  return {
    baseUrl: opts.baseUrl.replace(/\/$/, ""),
    database: opts.database,
    ontology: resolveHarnessMemoriesOntology(opts.ontology),
    auth: createBearerTokenAuthProvider(opts.adminToken),
  };
}

export async function createHarnessMemoriesClient(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
  ontology: HarnessMemoriesOntology;
  adminToken: string;
}): Promise<RemoteMemoriesClientAsync> {
  return createRemoteMemoriesClientAsync(remoteClientOptions(opts));
}

/** Sync handle that lazily materializes via memories-service deferred remote client. */
export function createDeferredHarnessMemoriesClient(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
  ontology: HarnessMemoriesOntology;
  adminToken: string;
}): RemoteMemoriesClientAsync {
  return createDeferredRemoteMemoriesClientAsync(remoteClientOptions(opts));
}

export function agentMemoriesDatabase(agentDid: string): MemoriesDatabaseId {
  return { kind: "account", ownerKey: agentDid };
}
