import type { DeleteMemoryParams, MergeMemoryParams, SearchParams } from "@khoralabs/memories-core";
import {
  createNoAuthProvider,
  createRemoteMemoriesClientAsync,
  type RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service-client";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service-storage-core";

export { HARNESS_MEMORY_LINK_LABEL, harnessMemoriesOntology } from "./harness-ontology.ts";

import { harnessMemoriesOntology } from "./harness-ontology.ts";

export async function createHarnessMemoriesClient(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
}): Promise<RemoteMemoriesClientAsync> {
  return createRemoteMemoriesClientAsync({
    baseUrl: opts.baseUrl.replace(/\/$/, ""),
    database: opts.database,
    ontology: harnessMemoriesOntology,
    auth: createNoAuthProvider(),
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
