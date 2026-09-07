import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { ensureCustomSqliteForExtensions } from "@khoralabs/memories-node/sqlite";

/**
 * Ensure Bun uses a libsqlite3 with extension loading (and prefer SQLCipher when
 * available) before any `bun:sqlite` open. Soften later setCustomSQLite attempts
 * once SQLite is already loaded.
 */
export function prepareSqliteForEncryptedMemories(): void {
  const original = Database.setCustomSQLite.bind(Database);
  Database.setCustomSQLite = ((path: string) => {
    try {
      original(path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/SQLite already loaded/i.test(msg)) throw e;
    }
  }) as typeof Database.setCustomSQLite;

  // Prefer Homebrew SQLite for SQLITE_CUSTOM_LIB (sqlite-vec needs extension loading).
  if (!process.env.SQLITE_CUSTOM_LIB?.trim()) {
    for (const p of [
      "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
      "/usr/local/opt/sqlite/lib/libsqlite3.dylib",
      "/opt/homebrew/opt/sqlite3/lib/libsqlite3.dylib",
      "/usr/local/opt/sqlite3/lib/libsqlite3.dylib",
    ]) {
      if (existsSync(p)) {
        process.env.SQLITE_CUSTOM_LIB = p;
        break;
      }
    }
  }

  // Prefer SQLCipher only for the SQLCIPHER_CUSTOM_LIB slot (encrypted memories).
  if (!process.env.SQLCIPHER_CUSTOM_LIB?.trim()) {
    for (const p of [
      "/opt/homebrew/opt/sqlcipher/lib/libsqlcipher.dylib",
      "/usr/local/opt/sqlcipher/lib/libsqlcipher.dylib",
    ]) {
      if (existsSync(p)) {
        process.env.SQLCIPHER_CUSTOM_LIB = p;
        break;
      }
    }
  }

  ensureCustomSqliteForExtensions();
}
