/**
 * Must run via `bun test --preload` before any test imports `bun:sqlite`.
 * Once Bun loads its bundled SQLite, Database.setCustomSQLite fails with
 * "SQLite already loaded" and sqlite-vec cannot be enabled.
 */
import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function tryHomebrewSqliteDylibPath(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  try {
    const prefix = execFileSync("brew", ["--prefix", "sqlite"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (prefix.length === 0) return undefined;
    const p = join(prefix, "lib", "libsqlite3.dylib");
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

function resolveCustomSqliteLib(): string | undefined {
  const fromEnv = process.env.SQLITE_CUSTOM_LIB?.trim();
  const candidates: string[] = [];
  if (fromEnv !== undefined && fromEnv.length > 0) candidates.push(fromEnv);

  const brew = tryHomebrewSqliteDylibPath();
  if (brew !== undefined) candidates.push(brew);

  if (process.platform === "darwin") {
    candidates.push(
      "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
      "/usr/local/opt/sqlite/lib/libsqlite3.dylib",
    );
  }

  if (process.platform === "linux") {
    candidates.push(
      "/usr/lib/x86_64-linux-gnu/libsqlite3.so.0",
      "/usr/lib/aarch64-linux-gnu/libsqlite3.so.0",
    );
  }

  for (const p of candidates) {
    if (p.length > 0 && existsSync(p)) return p;
  }
  return undefined;
}

const lib = resolveCustomSqliteLib();
if (lib !== undefined) {
  process.env.SQLITE_CUSTOM_LIB = lib;
  try {
    Database.setCustomSQLite(lib);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/SQLite already loaded/i.test(msg)) throw error;
  }
}
