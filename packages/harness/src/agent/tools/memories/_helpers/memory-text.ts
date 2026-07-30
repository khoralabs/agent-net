import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import {
  createRemoteSourceMapContentStore,
  DEFAULT_MEMORY_SOURCE_KEY,
} from "./source-map-content-store.ts";

export async function loadMemoryTextByKey(
  client: RemoteMemoriesClientAsync,
  namespace: string,
  key: string,
  sourceKey: string = DEFAULT_MEMORY_SOURCE_KEY,
): Promise<string | undefined> {
  const memoryId = await client.persistence.findMemoryIdByKey(namespace, key);
  if (memoryId === undefined) return undefined;

  const store = createRemoteSourceMapContentStore(client);
  try {
    const content = await store.resolve({
      memory_id: memoryId,
      source_key: sourceKey,
    });
    if (content.kind !== "string" || content.string.length === 0) {
      return undefined;
    }
    return content.string;
  } catch {
    return undefined;
  }
}
