import type { Database } from "bun:sqlite";
import type { PendingEmbeddingQueuePort } from "@khoralabs/khora-host/persistence";

/**
 * One-shot copy of legacy `pending_embeddings` rows from a memories SQLite file
 * into the host-owned queue. No-op if the table is absent. Attempt counters reset
 * (enqueue semantics); payloads are preserved.
 */
export function migrateLegacyPendingEmbeddingsFromMemoriesDb(
  memoriesDb: Database,
  queue: PendingEmbeddingQueuePort,
): number {
  const table = memoriesDb
    .query<{ name: string }, [string]>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get("pending_embeddings");
  if (table === null || table === undefined) return 0;

  const cols = memoriesDb
    .query<{ name: string }, []>("PRAGMA table_info(pending_embeddings)")
    .all()
    .map((c) => c.name);
  const hasSourceKey = cols.includes("source_key");

  const rows = hasSourceKey
    ? memoriesDb
        .query<{ namespace: string; memory_key: string; source_key: string; text: string }, []>(
          `SELECT namespace, memory_key, source_key, text FROM pending_embeddings`,
        )
        .all()
    : memoriesDb
        .query<{ namespace: string; memory_key: string; text: string }, []>(
          `SELECT namespace, memory_key, text FROM pending_embeddings`,
        )
        .all()
        .map((r) => ({ ...r, source_key: "body" }));

  let migrated = 0;
  for (const row of rows) {
    if (row.text.trim().length === 0) continue;
    queue.enqueue({
      namespace: row.namespace,
      memoryKey: row.memory_key,
      sourceKey: row.source_key.trim().length > 0 ? row.source_key : "body",
      text: row.text,
    });
    migrated += 1;
  }
  memoriesDb.run("DROP TABLE pending_embeddings");
  return migrated;
}
