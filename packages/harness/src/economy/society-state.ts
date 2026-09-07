import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";

import type {
  ActorWake,
  ActorWakeReason,
  ActorWakeStatus,
  NegotiationInvitation,
  NegotiationInvitationStatus,
  SocietyConfig,
} from "./society-types.ts";

export type SocietyState = {
  sessionId: string;
  tokensUsed: number;
  turnsCompleted: number;
  status: "running" | "completed" | "stopped";
  actorTurns: Record<string, number>;
};

const clients = new Map<string, Client>();
let schemaReady = new Map<string, Promise<void>>();

function client(dataDir: string): Client {
  mkdirSync(dataDir, { recursive: true });
  let db = clients.get(dataDir);
  if (db === undefined) {
    db = createClient({ url: `file:${path.join(dataDir, "workflow.db")}` });
    clients.set(dataDir, db);
  }
  return db;
}

async function ensureSchema(dataDir: string): Promise<void> {
  const existing = schemaReady.get(dataDir);
  if (existing !== undefined) return existing;
  const ready = (async () => {
    const db = client(dataDir);
    await db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS society_sessions (
        session_id TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        turns_completed INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        prepared INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS society_actors (
        session_id TEXT NOT NULL,
        actor_did TEXT NOT NULL,
        turns_completed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, actor_did)
      );
      CREATE TABLE IF NOT EXISTS society_wakes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        actor_did TEXT NOT NULL,
        reason TEXT NOT NULL,
        due_at_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        dedupe_key TEXT,
        payload_json TEXT,
        last_error TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS society_wakes_due
        ON society_wakes (session_id, status, due_at_ms);
      CREATE UNIQUE INDEX IF NOT EXISTS society_wakes_dedupe
        ON society_wakes (session_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS society_relationships (
        session_id TEXT NOT NULL,
        pair_key TEXT NOT NULL,
        relationship_ref TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY (session_id, pair_key)
      );
      CREATE TABLE IF NOT EXISTS society_negotiation_invitations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        initiator_did TEXT NOT NULL,
        responder_did TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        relationship_ref TEXT NOT NULL,
        chain_id TEXT,
        channel_id TEXT,
        vellum_session_id TEXT,
        last_error TEXT,
        expires_at_ms INTEGER,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS society_invitations_actor
        ON society_negotiation_invitations (session_id, initiator_did, responder_did, created_at_ms);
    `);
  })().catch((error) => {
    schemaReady.delete(dataDir);
    throw error;
  });
  schemaReady.set(dataDir, ready);
  return ready;
}

function wakeFromRow(row: Record<string, unknown>): ActorWake {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    actorDid: String(row.actor_did),
    reason: String(row.reason) as ActorWakeReason,
    dueAtMs: Number(row.due_at_ms),
    status: String(row.status) as ActorWakeStatus,
    attempts: Number(row.attempts),
    ...(row.dedupe_key != null ? { dedupeKey: String(row.dedupe_key) } : {}),
    ...(row.payload_json != null ? { payload: JSON.parse(String(row.payload_json)) } : {}),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

function invitationFromRow(row: Record<string, unknown>): NegotiationInvitation {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    initiatorDid: String(row.initiator_did),
    responderDid: String(row.responder_did),
    status: String(row.status) as NegotiationInvitationStatus,
    ...(row.message != null ? { message: String(row.message) } : {}),
    relationshipRef: String(row.relationship_ref),
    ...(row.chain_id != null ? { chainId: String(row.chain_id) } : {}),
    ...(row.channel_id != null ? { channelId: String(row.channel_id) } : {}),
    ...(row.vellum_session_id != null ? { vellumSessionId: String(row.vellum_session_id) } : {}),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

export async function initializeSocietyState(
  config: SocietyConfig,
): Promise<{ created: boolean; prepared: boolean }> {
  await ensureSchema(config.dataDir);
  const db = client(config.dataDir);
  const now = Date.now();
  const inserted = await db.execute({
    sql: `INSERT OR IGNORE INTO society_sessions
            (session_id, config_json, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, ?)`,
    args: [config.sessionId, JSON.stringify(config), now, now],
  });
  for (const actorDid of config.actorDids) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO society_actors (session_id, actor_did) VALUES (?, ?)`,
      args: [config.sessionId, actorDid],
    });
  }
  const row = await db.execute({
    sql: "SELECT prepared FROM society_sessions WHERE session_id = ?",
    args: [config.sessionId],
  });
  return {
    created: inserted.rowsAffected === 1,
    prepared: Number(row.rows[0]?.prepared) === 1,
  };
}

export async function markSocietyPrepared(dataDir: string, sessionId: string): Promise<void> {
  await ensureSchema(dataDir);
  await client(dataDir).execute({
    sql: "UPDATE society_sessions SET prepared = 1, updated_at_ms = ? WHERE session_id = ?",
    args: [Date.now(), sessionId],
  });
}

export async function enqueueActorWake(
  config: SocietyConfig,
  input: {
    actorDid: string;
    reason: ActorWakeReason;
    payload?: unknown;
    dueAtMs?: number;
    dedupeKey?: string;
  },
): Promise<ActorWake> {
  await ensureSchema(config.dataDir);
  if (!config.actorDids.includes(input.actorDid)) {
    throw new Error(`actor ${input.actorDid} is not in society ${config.sessionId}`);
  }
  const db = client(config.dataDir);
  const now = Date.now();
  const id = crypto.randomUUID();
  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO society_wakes
            (id, session_id, actor_did, reason, due_at_ms, status, attempts,
             dedupe_key, payload_json, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    args: [
      id,
      config.sessionId,
      input.actorDid,
      input.reason,
      input.dueAtMs ?? now,
      input.dedupeKey ?? null,
      input.payload === undefined ? null : JSON.stringify(input.payload),
      now,
      now,
    ],
  });
  const rows = await db.execute({
    sql:
      result.rowsAffected === 1
        ? "SELECT * FROM society_wakes WHERE id = ?"
        : "SELECT * FROM society_wakes WHERE session_id = ? AND dedupe_key = ?",
    args: result.rowsAffected === 1 ? [id] : [config.sessionId, input.dedupeKey ?? null],
  });
  const row = rows.rows[0];
  if (row === undefined) throw new Error("failed to enqueue actor wake");
  return wakeFromRow(row as Record<string, unknown>);
}

export async function listDueActorWakes(
  dataDir: string,
  sessionId: string,
  nowMs = Date.now(),
  limit = 100,
): Promise<ActorWake[]> {
  await ensureSchema(dataDir);
  const rows = await client(dataDir).execute({
    sql: `SELECT * FROM society_wakes
          WHERE session_id = ? AND status = 'pending' AND due_at_ms <= ?
          ORDER BY due_at_ms, created_at_ms LIMIT ?`,
    args: [sessionId, nowMs, limit],
  });
  return rows.rows.map((row) => wakeFromRow(row as Record<string, unknown>));
}

export async function claimActorWake(dataDir: string, wakeId: string): Promise<boolean> {
  await ensureSchema(dataDir);
  const result = await client(dataDir).execute({
    sql: `UPDATE society_wakes
          SET status = 'running', attempts = attempts + 1, updated_at_ms = ?
          WHERE id = ? AND status = 'pending'`,
    args: [Date.now(), wakeId],
  });
  return result.rowsAffected === 1;
}

export async function settleActorWake(
  dataDir: string,
  wakeId: string,
  status: "completed" | "failed" | "cancelled" | "pending",
  error?: string,
): Promise<void> {
  await ensureSchema(dataDir);
  await client(dataDir).execute({
    sql: "UPDATE society_wakes SET status = ?, last_error = ?, updated_at_ms = ? WHERE id = ?",
    args: [status, error ?? null, Date.now(), wakeId],
  });
}

export async function recoverActorWakes(dataDir: string, sessionId: string): Promise<number> {
  await ensureSchema(dataDir);
  const result = await client(dataDir).execute({
    sql: `UPDATE society_wakes SET status = 'pending', updated_at_ms = ?
          WHERE session_id = ? AND status = 'running'`,
    args: [Date.now(), sessionId],
  });
  return result.rowsAffected;
}

export async function recordSocietyTurn(
  dataDir: string,
  sessionId: string,
  actorDid: string,
  tokensUsed: number,
): Promise<void> {
  await ensureSchema(dataDir);
  const db = client(dataDir);
  await db.execute({
    sql: `UPDATE society_sessions
          SET tokens_used = tokens_used + ?, turns_completed = turns_completed + 1,
              updated_at_ms = ?
          WHERE session_id = ?`,
    args: [tokensUsed, Date.now(), sessionId],
  });
  await db.execute({
    sql: `UPDATE society_actors SET turns_completed = turns_completed + 1
          WHERE session_id = ? AND actor_did = ?`,
    args: [sessionId, actorDid],
  });
}

export async function recordSocietyUsage(
  dataDir: string,
  sessionId: string,
  tokensUsed: number,
): Promise<void> {
  await ensureSchema(dataDir);
  await client(dataDir).execute({
    sql: `UPDATE society_sessions
          SET tokens_used = tokens_used + ?, updated_at_ms = ?
          WHERE session_id = ?`,
    args: [tokensUsed, Date.now(), sessionId],
  });
}

export async function loadSocietyState(dataDir: string, sessionId: string): Promise<SocietyState> {
  await ensureSchema(dataDir);
  const db = client(dataDir);
  const [session, actors] = await Promise.all([
    db.execute({
      sql: "SELECT * FROM society_sessions WHERE session_id = ?",
      args: [sessionId],
    }),
    db.execute({
      sql: "SELECT actor_did, turns_completed FROM society_actors WHERE session_id = ?",
      args: [sessionId],
    }),
  ]);
  const row = session.rows[0];
  if (row === undefined) throw new Error(`society ${sessionId} not found`);
  return {
    sessionId,
    tokensUsed: Number(row.tokens_used),
    turnsCompleted: Number(row.turns_completed),
    status: String(row.status) as SocietyState["status"],
    actorTurns: Object.fromEntries(
      actors.rows.map((actor) => [String(actor.actor_did), Number(actor.turns_completed)]),
    ),
  };
}

export async function updateSocietyStatus(
  dataDir: string,
  sessionId: string,
  status: SocietyState["status"],
): Promise<void> {
  await ensureSchema(dataDir);
  await client(dataDir).execute({
    sql: "UPDATE society_sessions SET status = ?, updated_at_ms = ? WHERE session_id = ?",
    args: [status, Date.now(), sessionId],
  });
}

export async function listActorWakes(
  dataDir: string,
  sessionId: string,
  actorDid: string,
): Promise<ActorWake[]> {
  await ensureSchema(dataDir);
  const rows = await client(dataDir).execute({
    sql: `SELECT * FROM society_wakes WHERE session_id = ? AND actor_did = ?
          ORDER BY created_at_ms`,
    args: [sessionId, actorDid],
  });
  return rows.rows.map((row) => wakeFromRow(row as Record<string, unknown>));
}

function pairKey(didA: string, didB: string): string {
  return [didA, didB].sort().join("\0");
}

export async function createNegotiationInvitation(
  config: SocietyConfig,
  initiatorDid: string,
  responderDid: string,
  message?: string,
  expiresAtMs?: number,
): Promise<NegotiationInvitation> {
  await ensureSchema(config.dataDir);
  if (initiatorDid === responderDid) throw new Error("cannot invite self to a negotiation");
  if (!config.actorDids.includes(initiatorDid) || !config.actorDids.includes(responderDid)) {
    throw new Error("negotiation parties must belong to the society");
  }
  const db = client(config.dataDir);
  const now = Date.now();
  const key = pairKey(initiatorDid, responderDid);
  await db.execute({
    sql: `INSERT OR IGNORE INTO society_relationships
            (session_id, pair_key, relationship_ref, created_at_ms)
          VALUES (?, ?, ?, ?)`,
    args: [config.sessionId, key, `relationship:${crypto.randomUUID()}`, now],
  });
  const relationship = await db.execute({
    sql: "SELECT relationship_ref FROM society_relationships WHERE session_id = ? AND pair_key = ?",
    args: [config.sessionId, key],
  });
  const relationshipRef = String(relationship.rows[0]?.relationship_ref);
  const invitation: NegotiationInvitation = {
    id: crypto.randomUUID(),
    sessionId: config.sessionId,
    initiatorDid,
    responderDid,
    status: "pending",
    ...(message !== undefined ? { message } : {}),
    relationshipRef,
    createdAtMs: now,
    updatedAtMs: now,
  };
  await db.execute({
    sql: `INSERT INTO society_negotiation_invitations
            (id, session_id, initiator_did, responder_did, status, message,
             relationship_ref, expires_at_ms, created_at_ms, updated_at_ms)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    args: [
      invitation.id,
      invitation.sessionId,
      initiatorDid,
      responderDid,
      message ?? null,
      relationshipRef,
      expiresAtMs ?? null,
      now,
      now,
    ],
  });
  return invitation;
}

export async function listNegotiationInvitations(
  dataDir: string,
  sessionId: string,
  actorDid: string,
): Promise<NegotiationInvitation[]> {
  await ensureSchema(dataDir);
  const db = client(dataDir);
  await db.execute({
    sql: `UPDATE society_negotiation_invitations
          SET status = 'expired', updated_at_ms = ?
          WHERE session_id = ? AND status = 'pending' AND expires_at_ms <= ?`,
    args: [Date.now(), sessionId, Date.now()],
  });
  const rows = await db.execute({
    sql: `SELECT * FROM society_negotiation_invitations
          WHERE session_id = ? AND (initiator_did = ? OR responder_did = ?)
          ORDER BY created_at_ms`,
    args: [sessionId, actorDid, actorDid],
  });
  return rows.rows.map((row) => invitationFromRow(row as Record<string, unknown>));
}

export async function loadNegotiationInvitation(
  dataDir: string,
  invitationId: string,
): Promise<NegotiationInvitation | null> {
  await ensureSchema(dataDir);
  const rows = await client(dataDir).execute({
    sql: "SELECT * FROM society_negotiation_invitations WHERE id = ?",
    args: [invitationId],
  });
  const row = rows.rows[0];
  if (row === undefined) return null;
  const invitation = invitationFromRow(row as Record<string, unknown>);
  if (
    invitation.status === "pending" &&
    row.expires_at_ms != null &&
    Number(row.expires_at_ms) <= Date.now()
  ) {
    await client(dataDir).execute({
      sql: `UPDATE society_negotiation_invitations
            SET status = 'expired', updated_at_ms = ?
            WHERE id = ? AND status = 'pending'`,
      args: [Date.now(), invitationId],
    });
    return { ...invitation, status: "expired", updatedAtMs: Date.now() };
  }
  return invitation;
}

export async function updateNegotiationInvitation(
  dataDir: string,
  invitationId: string,
  actorDid: string,
  fromStatus: NegotiationInvitationStatus,
  status: NegotiationInvitationStatus,
  details?: {
    chainId?: string;
    channelId?: string;
    vellumSessionId?: string;
    error?: string;
  },
): Promise<NegotiationInvitation> {
  await ensureSchema(dataDir);
  const db = client(dataDir);
  const existing = await loadNegotiationInvitation(dataDir, invitationId);
  if (existing === null) throw new Error(`negotiation invitation ${invitationId} not found`);
  const authorized =
    (status === "cancelled" && existing.initiatorDid === actorDid) ||
    (status !== "cancelled" && existing.responderDid === actorDid);
  if (!authorized) throw new Error("actor is not authorized to update this invitation");
  const result = await db.execute({
    sql: `UPDATE society_negotiation_invitations SET
            status = ?, chain_id = COALESCE(?, chain_id),
            channel_id = COALESCE(?, channel_id),
            vellum_session_id = COALESCE(?, vellum_session_id),
            last_error = ?, updated_at_ms = ?
          WHERE id = ? AND status = ?`,
    args: [
      status,
      details?.chainId ?? null,
      details?.channelId ?? null,
      details?.vellumSessionId ?? null,
      details?.error ?? null,
      Date.now(),
      invitationId,
      fromStatus,
    ],
  });
  if (result.rowsAffected !== 1) {
    throw new Error(`negotiation invitation ${invitationId} is not ${fromStatus}`);
  }
  const updated = await loadNegotiationInvitation(dataDir, invitationId);
  if (updated === null) throw new Error(`negotiation invitation ${invitationId} not found`);
  return updated;
}

export function resetSocietyStateForTests(): void {
  clients.clear();
  schemaReady = new Map();
}
