import type { SourceMap, Store } from "@khoralabs/memories-node";
import { ids } from "@khoralabs/memories-node";

/** Prefix used by `decomposeLogicalMemoryToContent` (`text:0`, `text:1`, …). */
export const MEMORY_TEXT_SOURCE_PREFIX = "text";

/** First chunk key for a logical memory (`text:0`). */
export const DEFAULT_MEMORY_SOURCE_KEY = `${MEMORY_TEXT_SOURCE_PREFIX}:0`;

/** Minimal client surface needed to resolve source-map text over HTTP. */
export type SourceMapTextPreviewClient = {
  persistence: {
    getSourceMapTextPreview(sourceMapId: string, maxChars?: number): Promise<string | null>;
  };
};

/**
 * Sourcemaps content {@link Store} for DB-backed memories: `resolve` loads
 * plaintext via `getSourceMapTextPreview` (HTTP → SQLite), not search.
 * Default source key is {@link DEFAULT_MEMORY_SOURCE_KEY} (`text:0`).
 */
export function createRemoteSourceMapContentStore(client: SourceMapTextPreviewClient): Store {
  return {
    async resolve(ref: SourceMap) {
      const memoryId = ref.memory_id?.trim() ?? "";
      const sourceKey = ref.source_key?.trim() || DEFAULT_MEMORY_SOURCE_KEY;
      if (memoryId.length === 0) {
        throw new Error("source map ref missing memory_id");
      }
      const sourceMapId = ids.sourceMap(memoryId, sourceKey);
      const text = await client.persistence.getSourceMapTextPreview(sourceMapId, 100_000);
      if (text === null) {
        throw new Error(`source map content not found: ${memoryId}/${sourceKey}`);
      }
      return { kind: "string", string: text };
    },
  };
}
