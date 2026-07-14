import type { SearchHit } from "@khoralabs/memories-core";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

function sourceMapIdFromHit(hit: SearchHit): string {
  return hit._id;
}

export async function loadMemoryTextByKey(
  client: RemoteMemoriesClientAsync,
  namespace: string,
  key: string,
): Promise<string | undefined> {
  const memoryId = await client.persistence.findMemoryIdByKey(namespace, key);
  if (memoryId === undefined) return undefined;

  const hits = await client.search({
    namespace,
    content: { text: key },
    options: { topK: 8, neighbors: false, arms: { lexical: 1, vector: 0 } },
  });
  const hit = hits.find((candidate) => candidate.memory.key === key);
  if (hit === undefined) return undefined;
  const text = await client.persistence.getSourceMapTextPreview(sourceMapIdFromHit(hit), 100_000);
  if (text === null || text.length === 0) return undefined;
  return text;
}
