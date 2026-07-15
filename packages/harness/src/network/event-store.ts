import { mkdirSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";

import { workflowDbPath } from "../workflow/paths.ts";
import type { NetworkEvent } from "./types.ts";

let schemaReadyByDataDir = new Map<string, Promise<void>>();
const clients = new Map<string, Client>();

function getClient(dataDir: string): Client {
  mkdirSync(dataDir, { recursive: true });
  let existing = clients.get(dataDir);
  if (existing === undefined) {
    existing = createClient({ url: `file:${workflowDbPath(dataDir)}` });
    clients.set(dataDir, existing);
  }
  return existing;
}

async function ensureNetworkEventsSchema(dataDir: string): Promise<void> {
  const pending = schemaReadyByDataDir.get(dataDir);
  if (pending !== undefined) return pending;
  const ready = (async () => {
    const db = getClient(dataDir);
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
  schemaReadyByDataDir.set(dataDir, ready);
  return ready;
}

export async function persistNetworkEvent(
  dataDir: string,
  event: NetworkEvent,
): Promise<NetworkEvent | null> {
  await ensureNetworkEventsSchema(dataDir);
  const db = getClient(dataDir);
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
}

export type ListNetworkEventsOptions = {
  kind?: string;
  agentDid?: string;
  sinceSeq?: number;
};

export async function queryNetworkEvents(
  dataDir: string,
  sessionId: string,
  opts: ListNetworkEventsOptions = {},
): Promise<NetworkEvent[]> {
  await ensureNetworkEventsSchema(dataDir);
  const db = getClient(dataDir);
  const conditions = ["session_id = ?"];
  const args: Array<string | number> = [sessionId];
  if (opts.kind !== undefined) {
    conditions.push("kind = ?");
    args.push(opts.kind);
  }
  if (opts.agentDid !== undefined) {
    conditions.push("agent_did = ?");
    args.push(opts.agentDid);
  }
  if (opts.sinceSeq !== undefined) {
    conditions.push("seq > ?");
    args.push(opts.sinceSeq);
  }
  const result = await db.execute({
    sql: `SELECT payload_json FROM network_events
          WHERE ${conditions.join(" AND ")}
          ORDER BY seq ASC`,
    args,
  });
  return result.rows.map((row) => JSON.parse(String(row.payload_json)) as NetworkEvent);
}

export function networkEventId(input: {
  sessionId: string;
  kind: string;
  runId?: string;
  agentDid?: string;
  turnIndex?: number;
  extra?: string;
}): string {
  return [
    input.sessionId,
    input.kind,
    input.runId ?? "",
    input.agentDid ?? "",
    input.turnIndex !== undefined ? String(input.turnIndex) : "",
    input.extra ?? "",
  ].join(":");
}

export function resetNetworkEventStoreForTests(): void {
  clients.clear();
  schemaReadyByDataDir = new Map();
}
