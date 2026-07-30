import type { SourceMap, Store } from "@khoralabs/memories-node";
import { ids } from "@khoralabs/memories-node";

/** Default content source key used by harness `writeMemoryNode`. */
export const DEFAULT_MEMORY_SOURCE_KEY = "text";

/** Minimal client surface needed to resolve source-map text over HTTP. */
export type SourceMapTextPreviewClient = {
  persistence: {
    getSourceMapTextPreview(sourceMapId: string, maxChars?: number): Promise<string | null>;
  };
};

/**
 * Sourcemaps content {@link Store} for DB-backed memories: `resolve` loads
 * plaintext via `getSourceMapTextPreview` (HTTP → SQLite), not search.
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
