import type { MemoriesTelemetry } from "@khoralabs/memories-node/telemetry";
import { createNoneAuthStrategy } from "@khoralabs/memories-service/auth";
import { handleMemoriesServiceHttpRequest } from "@khoralabs/memories-service/http";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";

import { prepareSqliteForEncryptedMemories } from "./sqlite-prep.ts";

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
