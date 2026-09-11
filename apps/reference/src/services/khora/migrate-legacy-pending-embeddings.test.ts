import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createInMemoryPendingEmbeddingQueue } from "@khoralabs/khora-host/persistence";
import { migrateLegacyPendingEmbeddingsFromMemoriesDb } from "./migrate-legacy-pending-embeddings";

function seedLegacyTable(db: Database): void {
  db.run(`
    CREATE TABLE pending_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      namespace TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      source_key TEXT NOT NULL DEFAULT 'body',
      text TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(namespace, memory_key, source_key)
    );
  `);
  db.query(
    `INSERT INTO pending_embeddings (namespace, memory_key, source_key, text) VALUES (?, ?, ?, ?)`,
  ).run("ns", "m1", "body", "hello");
}

describe("migrateLegacyPendingEmbeddingsFromMemoriesDb", () => {
  test("copies rows then drops the legacy table", () => {
    const memoriesDb = new Database(":memory:");
    seedLegacyTable(memoriesDb);

    const queue = createInMemoryPendingEmbeddingQueue();
    expect(migrateLegacyPendingEmbeddingsFromMemoriesDb(memoriesDb, queue)).toBe(1);
    expect(queue.summary().pending).toBe(1);
    expect(queue.summary().rows[0]?.memoryKey).toBe("m1");

    const table = memoriesDb
      .query<{ name: string }, [string]>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get("pending_embeddings");
    expect(table).toBeNull();
  });

  test("second run is a no-op after drop", () => {
    const memoriesDb = new Database(":memory:");
    seedLegacyTable(memoriesDb);
    const queue = createInMemoryPendingEmbeddingQueue();
    expect(migrateLegacyPendingEmbeddingsFromMemoriesDb(memoriesDb, queue)).toBe(1);
    expect(migrateLegacyPendingEmbeddingsFromMemoriesDb(memoriesDb, queue)).toBe(0);
    expect(queue.summary().pending).toBe(1);
  });

  test("no-ops when table missing", () => {
    const memoriesDb = new Database(":memory:");
    const queue = createInMemoryPendingEmbeddingQueue();
    expect(migrateLegacyPendingEmbeddingsFromMemoriesDb(memoriesDb, queue)).toBe(0);
  });
});
