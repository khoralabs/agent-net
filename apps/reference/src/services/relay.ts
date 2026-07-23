import path from "node:path";
import {
  createRelayApp,
  createRelayHub,
  envRelayMaxChannels,
  openRelayPersistence,
  sqliteBackend,
} from "@khoralabs/relay/server";

export type RelayServerOptions = {
  dataDir: string;
  port?: number;
  sqlCipherKey?: string;
};

export type RelayServerHandle = {
  readonly port: number;
  readonly baseUrl: string;
  stop(): void;
};

export async function startRelayServer(opts: RelayServerOptions): Promise<RelayServerHandle> {
  const dbPath = path.join(opts.dataDir, "relay.sqlite");
  const { persistence, cleanup } = openRelayPersistence({
    durable: sqliteBackend({
      path: dbPath,
      key: opts.sqlCipherKey ?? "harness-relay-key",
    }),
  });
  const hub = createRelayHub({ admission: persistence.admission, spool: persistence.spool });

  const relayProfile = { mode: "pool" as const, maxRelayChannels: envRelayMaxChannels() };
  const app = createRelayApp({
    hub,
    spool: persistence.spool,
    persistence,
    relayProfile,
  });

  const bunServer = Bun.serve({
    port: opts.port ?? 0,
    fetch(req, srv) {
      return app.fetch(req, srv) as Promise<Response>;
    },
    websocket: app.websocket,
  });

  const port = bunServer.port ?? opts.port ?? 0;

  return {
    port,
    get baseUrl() {
      return `http://localhost:${port}`;
    },
    stop() {
      bunServer.stop(true);
      cleanup();
    },
  };
}
