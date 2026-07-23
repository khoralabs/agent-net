import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ListNetworkEventsOptions, NetworkEvent } from "@khoralabs/agent-net-harness";
import { createClient } from "@libsql/client";

import type { NetworkEventStore } from "./store.ts";

function workflowDbPath(dataDir: string): string {
  return path.join(dataDir, "workflow.db");
}

export type CreateSqliteNetworkEventStoreOptions = {
  dataDir: string;
};

export function createSqliteNetworkEventStore(
  opts: CreateSqliteNetworkEventStoreOptions,
): NetworkEventStore {
  mkdirSync(opts.dataDir, { recursive: true });
  const db = createClient({ url: `file:${workflowDbPath(opts.dataDir)}` });
  let schemaReady: Promise<void> | undefined;

  async function ensureSchema(): Promise<void> {
    if (schemaReady !== undefined) return schemaReady;
    schemaReady = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS network_events (
          event_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          ts_ms INTEGER NOT NULL,
          source TEXT NOT NULL,
          kind TEXT NOT NULL,
          agent_did TEXT,
          payload_json TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_network_events_session_seq
          ON network_events (session_id, seq)
      `);
      const legacy = await db.execute(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'swarm_network_events'`,
      );
      if (legacy.rows.length > 0) {
        await db.execute(`
          INSERT OR IGNORE INTO network_events
            (event_id, session_id, seq, ts_ms, source, kind, agent_did, payload_json)
          SELECT event_id, session_id, seq, ts_ms, source, kind, agent_did, payload_json
          FROM swarm_network_events
        `);
      }
    })();
    return schemaReady;
  }

  return {
    async append(event: NetworkEvent): Promise<NetworkEvent | null> {
      await ensureSchema();
      const maxRow = await db.execute({
        sql: `SELECT COALESCE(MAX(seq), 0) AS max_seq FROM network_events WHERE session_id = ?`,
        args: [event.sessionId],
      });
      const nextSeq = Number(maxRow.rows[0]?.max_seq ?? 0) + 1;
      const stored: NetworkEvent = { ...event, seq: nextSeq };
      const result = await db.execute({
        sql: `INSERT OR IGNORE INTO network_events
              (event_id, session_id, seq, ts_ms, source, kind, agent_did, payload_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          stored.eventId,
          stored.sessionId,
          nextSeq,
          stored.tsMs,
          stored.source,
          stored.kind,
          stored.agentDid ?? null,
          JSON.stringify(stored),
        ],
      });
      if (result.rowsAffected === 0) return null;
      return stored;
    },

    async list(
      sessionId: string,
      listOpts: ListNetworkEventsOptions = {},
    ): Promise<NetworkEvent[]> {
      await ensureSchema();
      const conditions = ["session_id = ?"];
      const args: Array<string | number> = [sessionId];
      if (listOpts.kind !== undefined) {
        conditions.push("kind = ?");
        args.push(listOpts.kind);
      }
      if (listOpts.agentDid !== undefined) {
        conditions.push("agent_did = ?");
        args.push(listOpts.agentDid);
      }
      if (listOpts.sinceSeq !== undefined) {
        conditions.push("seq > ?");
        args.push(listOpts.sinceSeq);
      }
      const result = await db.execute({
        sql: `SELECT payload_json FROM network_events
              WHERE ${conditions.join(" AND ")}
              ORDER BY seq ASC`,
        args,
      });
      return result.rows.map((row) => JSON.parse(String(row.payload_json)) as NetworkEvent);
    },

    close() {
      db.close();
      schemaReady = undefined;
    },
  };
}
