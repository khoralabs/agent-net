import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { ensureCustomSqliteForExtensions } from "@khoralabs/memories-node/sqlite";
import type { MemoriesTelemetry } from "@khoralabs/memories-node/telemetry";
import { createNoneAuthStrategy } from "@khoralabs/memories-service/auth";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service/http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";

export type MemoriesServiceOptions = {
  dataDir: string;
  sqlCipherKey?: string;
  port?: number;
  /** Structured telemetry for database lifecycle and node ops (e.g. from getHarnessMemoriesTelemetry). */
  telemetry?: MemoriesTelemetry;
};

export type MemoriesServiceHandle = {
  readonly port: number;
  readonly baseUrl: string;
  stop(): void;
};

function prepareSqliteForEncryptedMemories(): void {
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

export function startMemoriesService(opts: MemoriesServiceOptions): MemoriesServiceHandle {
  prepareSqliteForEncryptedMemories();

  const stack = createLocalSqliteServiceStack({
    dataDir: opts.dataDir,
    sqlCipherKey: opts.sqlCipherKey ?? "harness-memories-key",
    telemetry: opts.telemetry,
  });
  const auth = createNoneAuthStrategy();

  const server = Bun.serve({
    port: opts.port ?? 0,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      return handleMemoriesServiceHttpRequest(req, {
        service: stack.service,
        ontology: stack.ontology,
        auth,
      });
    },
  });

  const port = server.port ?? opts.port ?? 0;
  return {
    port,
    baseUrl: `http://localhost:${port}`,
    stop() {
      server.stop(true);
    },
  };
}
