/**
 * Ensures Bun uses a libsqlite3 with extension loading before any test opens `bun:sqlite`.
 * Otherwise earlier tests (e.g. direct `new Database(":memory:")`) load bundled SQLite and
 * `Database.setCustomSQLite` fails with "SQLite already loaded".
 *
 * Prefer SQLCipher when available so encrypted memories DBs (reference sqlCipherKey) work
 * with the same process-global SQLite. Soften later setCustomSQLite attempts once loaded.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { ensureCustomSqliteForExtensions } from "@khoralabs/memories-node/sqlite";

const originalSetCustomSQLite = Database.setCustomSQLite.bind(Database);
Database.setCustomSQLite = ((path: string) => {
  try {
    originalSetCustomSQLite(path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/SQLite already loaded/i.test(msg)) throw e;
  }
}) as typeof Database.setCustomSQLite;

const sqlCipherCandidates = [
  process.env.SQLCIPHER_CUSTOM_LIB?.trim(),
  "/opt/homebrew/opt/sqlcipher/lib/libsqlcipher.dylib",
  "/usr/local/opt/sqlcipher/lib/libsqlcipher.dylib",
].filter((p): p is string => p !== undefined && p.length > 0);

for (const p of sqlCipherCandidates) {
  if (existsSync(p)) {
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
