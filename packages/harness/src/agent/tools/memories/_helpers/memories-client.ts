import type { DeleteMemoryParams, MergeMemoryParams, SearchParams } from "@khoralabs/memories-node";
import {
  type LabelSchemaMap,
  mergeOntologies,
  type OntologyDefinition,
} from "@khoralabs/memories-node/ontology";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import {
  createBearerTokenAuthProvider,
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

export async function createHarnessMemoriesClient(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
  ontology: HarnessMemoriesOntology;
  adminToken: string;
}): Promise<RemoteMemoriesClientAsync> {
  return createRemoteMemoriesClientAsync({
    baseUrl: opts.baseUrl.replace(/\/$/, ""),
    database: opts.database,
    ontology: resolveHarnessMemoriesOntology(opts.ontology),
    auth: createBearerTokenAuthProvider(opts.adminToken),
  });
}

export function agentMemoriesDatabase(agentDid: string): MemoriesDatabaseId {
  return { kind: "account", ownerKey: agentDid };
}

export type CreateHarnessMemoriesClient = typeof createHarnessMemoriesClient;

export function createLazyHarnessMemoriesClient(
  opts: {
    baseUrl: string;
    database: MemoriesDatabaseId;
    ontology: HarnessMemoriesOntology;
    adminToken: string;
  },
  createClient: CreateHarnessMemoriesClient = createHarnessMemoriesClient,
): RemoteMemoriesClientAsync {
  let clientPromise: Promise<RemoteMemoriesClientAsync> | undefined;
  const getClient = () => (clientPromise ??= createClient(opts));

  return {
    search: (params: SearchParams) => getClient().then((client) => client.search(params)),
    mergeMemory: (params: MergeMemoryParams) =>
      getClient().then((client) => client.mergeMemory(params)),
    deleteMemory: (params: DeleteMemoryParams) =>
      getClient().then((client) => client.deleteMemory(params)),
    persistence: {
      listMemoryNamespaces: async () => {
        const client = await getClient();
        const listFn = client.persistence.listMemoryNamespaces;
        if (listFn === undefined) {
          throw new Error("memories client does not support listing namespaces");
        }
        return listFn.call(client.persistence);
      },
    },
  } as RemoteMemoriesClientAsync;
}
