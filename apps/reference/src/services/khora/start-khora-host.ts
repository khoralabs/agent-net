import { mkdirSync } from "node:fs";
import path from "node:path";

import type { KhoraWsData } from "@khoralabs/khora-client/transport";
import { bootstrapKhoraEncryption } from "@khoralabs/khora-host/bootstrap";
import {
  createHostRouteDepsFromEnv,
  createHostRouter,
  createInboxDrainWebSocketHandlersForDeps,
  runWithRequestPeerIp,
} from "@khoralabs/khora-host/http";

import { prepareSqliteForEncryptedMemories } from "../sqlite-prep.ts";
import { bootstrapKhoraHost } from "./bootstrap-host.ts";
import { envMemoriesBootstrapConfig } from "./memories-env.ts";
import { resolveKhoraPersistencePaths } from "./persistence-paths.ts";

export type KhoraHostServiceOptions = {
  /** Persistence root under the reference data dir (e.g. `{dataDir}/khora`). */
  dataDir: string;
  port?: number;
  /** When true (default), open cells via Bun Workers. */
  useCellWorkers?: boolean;
};

export type KhoraHostServiceHandle = {
  readonly port: number;
  readonly baseUrl: string;
  stop(): void;
};

function envColonnadeUseCellWorkers(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.KHORA_COLONNADE_CELL_WORKERS?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

function envTenantKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const p = env.KHORA_RELAY_TENANT_KEY?.trim();
  return p !== undefined && p.length > 0 ? p : undefined;
}

/**
 * Start an in-process Khora HTTP/WS host (non-blocking).
 * Does not register process signal handlers — the orchestrator owns shutdown.
 */
export async function startKhoraHost(
  opts: KhoraHostServiceOptions,
): Promise<KhoraHostServiceHandle> {
  prepareSqliteForEncryptedMemories();

  process.env.KHORA_DATA_DIR = opts.dataDir;
  const persistencePaths = resolveKhoraPersistencePaths(process.env);
  const { hostDbPath, authNoncesDbPath, percolatorDbPath, cellsDir, dataDir } = persistencePaths;
  const memoriesConfig = envMemoriesBootstrapConfig(persistencePaths);

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(path.dirname(hostDbPath), { recursive: true });
  mkdirSync(path.dirname(authNoncesDbPath), { recursive: true });
  mkdirSync(path.dirname(percolatorDbPath), { recursive: true });
  mkdirSync(cellsDir, { recursive: true });
  if (memoriesConfig !== undefined) {
    mkdirSync(memoriesConfig.memoriesDataDir, { recursive: true });
  }

  const encryption = await bootstrapKhoraEncryption();
  const tenantKey = envTenantKey();
  const { ctx } = await bootstrapKhoraHost({
    hostDbPath,
    authNoncesDbPath,
    percolatorDbPath,
    cellsDir,
    useCellWorkers: opts.useCellWorkers ?? envColonnadeUseCellWorkers(),
    encryption,
    ...(tenantKey !== undefined ? { tenantKey } : {}),
    ...(memoriesConfig !== undefined ? { memories: memoriesConfig } : {}),
  });

  // Same published multi-entrypoint .d.ts split as bootstrap-host.
  const { deps } = createHostRouteDepsFromEnv({
    ctx,
  } as unknown as Parameters<typeof createHostRouteDepsFromEnv>[0]);
  const { route } = createHostRouter({ hostSpec: ctx.hostSpec as never });
  const inboxWsHandlers = createInboxDrainWebSocketHandlersForDeps({
    ctx: ctx as never,
    rateLimiters: deps.rateLimiters,
  });

  const server = Bun.serve<KhoraWsData>({
    port: opts.port ?? 0,
    async fetch(req, srv) {
      const peerIp = srv.requestIP(req)?.address ?? null;
      return runWithRequestPeerIp(peerIp, async () => {
        const url = new URL(req.url);
        try {
          const res = await route(req, url, srv as never, deps);
          if (res !== undefined) return res;
          // Successful inbox WS upgrades return undefined; Bun requires that.
          if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
            return undefined;
          }
          return new Response("Not found", { status: 404 });
        } catch {
          return new Response("Internal server error", { status: 500 });
        }
      });
    },
    websocket: inboxWsHandlers,
  });

  const port = server.port ?? opts.port ?? 0;
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    stop() {
      try {
        ctx.principalTeardownWorker.stop();
      } catch {
        /* ignore */
      }
      try {
        ctx.cluster.close();
      } catch {
        /* ignore */
      }
      try {
        ctx.search?.close();
      } catch {
        /* ignore */
      }
      server.stop(true);
    },
  };
}
