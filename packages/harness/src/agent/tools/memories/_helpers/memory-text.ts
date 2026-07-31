import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import {
  createRemoteSourceMapContentStore,
  MEMORY_TEXT_SOURCE_PREFIX,
} from "./source-map-content-store.ts";

/** Max `text:N` chunks to assemble when reading a logical memory. */
const MAX_TEXT_CHUNKS = 64;

/**
 * Load full plaintext for a memory key by assembling `text:0`…`text:N`
 * (how `writeMemoryNode` / `decomposeLogicalMemoryToContent` store content).
 */
export async function loadMemoryTextByKey(
  client: RemoteMemoriesClientAsync,
  namespace: string,
  key: string,
): Promise<string | undefined> {
  const memoryId = await client.persistence.findMemoryIdByKey(namespace, key);
  if (memoryId === undefined) return undefined;

  const store = createRemoteSourceMapContentStore(client);
  const chunks: string[] = [];
  for (let i = 0; i < MAX_TEXT_CHUNKS; i++) {
    try {
      const content = await store.resolve({
        memory_id: memoryId,
        source_key: `${MEMORY_TEXT_SOURCE_PREFIX}:${i}`,
      });
      if (content.kind !== "string" || content.string.length === 0) break;
      chunks.push(content.string);
    } catch {
      break;
    }
  }
  if (chunks.length === 0) return undefined;
  // Primary split in textToContent is blank-line paragraphs.
  return chunks.join("\n\n");
}
