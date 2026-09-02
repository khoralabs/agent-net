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

  for (const p of [
    process.env.SQLCIPHER_CUSTOM_LIB?.trim(),
    "/opt/homebrew/opt/sqlcipher/lib/libsqlcipher.dylib",
    "/usr/local/opt/sqlcipher/lib/libsqlcipher.dylib",
  ]) {
    if (p !== undefined && p.length > 0 && existsSync(p)) {
      if (process.env.SQLITE_CUSTOM_LIB?.trim() === undefined) {
        process.env.SQLITE_CUSTOM_LIB = p;
      }
      if (process.env.SQLCIPHER_CUSTOM_LIB?.trim() === undefined) {
        process.env.SQLCIPHER_CUSTOM_LIB = p;
      }
      break;
    }
  }

  ensureCustomSqliteForExtensions();
}
