import path from "node:path";
import {
  createChannelRegistry,
  createRelayApp,
  createRelayHub,
  createRelayStores,
  envRelayMaxChannels,
  openRelayDatabase,
} from "@khoralabs/relay-server-http";

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
  const db = openRelayDatabase(dbPath, opts.sqlCipherKey ?? "harness-relay-key");
  const stores = createRelayStores(db);
  const hub = createRelayHub({ admission: stores.admission, spool: stores.spool });
  const registry = createChannelRegistry(db);

  const relayProfile = { mode: "pool" as const, maxRelayChannels: envRelayMaxChannels() };
  const app = createRelayApp({ registry, hub, spool: stores.spool, relayProfile });

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
      db.close();
    },
  };
}
