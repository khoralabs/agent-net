import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";

import type {
  EconomyActor,
  EconomyConfig,
  EconomyEncounter,
  EconomyEncounterStatus,
  EconomyPersistedState,
  EconomyRound,
  EconomyRoundStatus,
  EconomySessionStatus,
} from "./types.ts";

function workflowDbPath(dataDir: string): string {
  return path.join(dataDir, "workflow.db");
}

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

async function ensureSchema(dataDir: string): Promise<void> {
  const pending = schemaReadyByDataDir.get(dataDir);
  if (pending !== undefined) return pending;
  const ready = (async () => {
    const db = getClient(dataDir);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS economy_sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        config_json TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        max_token_budget INTEGER NOT NULL,
        actors_json TEXT NOT NULL,
        current_round_index INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS economy_rounds (
        session_id TEXT NOT NULL,
        round_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        encounter_ids_json TEXT NOT NULL,
        started_at_ms INTEGER,
        completed_at_ms INTEGER,
        PRIMARY KEY (session_id, round_index)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS economy_encounters (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        round_index INTEGER NOT NULL,
        initiator_did TEXT NOT NULL,
        counterparty_did TEXT NOT NULL,
        chain_id TEXT,
        is_repeat INTEGER NOT NULL DEFAULT 0,
        prior_encounter_id TEXT,
        status TEXT NOT NULL,
        turns_completed INTEGER NOT NULL DEFAULT 0,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        terminal_outcome TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS economy_encounters_session_round
      ON economy_encounters (session_id, round_index)
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS economy_encounters_pair
      ON economy_encounters (session_id, initiator_did, counterparty_did)
    `);
  })().catch((err) => {
    schemaReadyByDataDir.delete(dataDir);
    throw err;
  });
  schemaReadyByDataDir.set(dataDir, ready);
  return ready;
}

function rowToEncounter(row: Record<string, unknown>): EconomyEncounter {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    roundIndex: Number(row.round_index),
    initiatorDid: String(row.initiator_did),
    counterpartyDid: String(row.counterparty_did),
    ...(row.chain_id !== null && row.chain_id !== undefined
      ? { chainId: String(row.chain_id) }
      : {}),
    isRepeat: Number(row.is_repeat) === 1,
    ...(row.prior_encounter_id !== null && row.prior_encounter_id !== undefined
      ? { priorEncounterId: String(row.prior_encounter_id) }
      : {}),
    status: String(row.status) as EconomyEncounterStatus,
    turnsCompleted: Number(row.turns_completed),
    tokensUsed: Number(row.tokens_used),
    ...(row.terminal_outcome !== null && row.terminal_outcome !== undefined
      ? { terminalOutcome: String(row.terminal_outcome) }
      : {}),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
  };
}

export async function createEconomyState(
  dataDir: string,
  config: EconomyConfig,
  actors: EconomyActor[],
): Promise<EconomyPersistedState> {
  await ensureSchema(dataDir);
  const id = crypto.randomUUID();
  const db = getClient(dataDir);
  await db.execute({
    sql: `INSERT INTO economy_sessions (
            id, session_id, config_json, tokens_used, max_token_budget,
            actors_json, current_round_index, status, created_at_ms
          ) VALUES (?, ?, ?, 0, ?, ?, 0, ?, ?)`,
    args: [
      id,
      config.sessionId,
      JSON.stringify(config),
      config.maxTokenBudget,
      JSON.stringify(actors),
      "setup",
      Date.now(),
    ],
  });
  return {
    id,
    sessionId: config.sessionId,
    config,
    tokensUsed: 0,
    actors,
    currentRoundIndex: 0,
    status: "setup",
  };
}

export async function loadEconomyState(
  dataDir: string,
  economyStateId: string,
): Promise<EconomyPersistedState> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT id, session_id, config_json, tokens_used, actors_json,
                 current_round_index, status
          FROM economy_sessions WHERE id = ?`,
    args: [economyStateId],
  });
  const record = row.rows[0];
  if (!record) throw new Error(`economy state ${economyStateId} not found`);
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    config: JSON.parse(String(record.config_json)) as EconomyConfig,
    tokensUsed: Number(record.tokens_used),
    actors: JSON.parse(String(record.actors_json)) as EconomyActor[],
    currentRoundIndex: Number(record.current_round_index),
    status: String(record.status) as EconomySessionStatus,
  };
}

export async function loadEconomyStateBySessionId(
  dataDir: string,
  sessionId: string,
): Promise<EconomyPersistedState | null> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT id, session_id, config_json, tokens_used, actors_json,
                 current_round_index, status
          FROM economy_sessions WHERE session_id = ?`,
    args: [sessionId],
  });
  const record = row.rows[0];
  if (!record) return null;
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    config: JSON.parse(String(record.config_json)) as EconomyConfig,
    tokensUsed: Number(record.tokens_used),
    actors: JSON.parse(String(record.actors_json)) as EconomyActor[],
    currentRoundIndex: Number(record.current_round_index),
    status: String(record.status) as EconomySessionStatus,
  };
}

export async function updateEconomySessionStatus(
  dataDir: string,
  economyStateId: string,
  status: EconomySessionStatus,
  currentRoundIndex?: number,
): Promise<void> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  if (currentRoundIndex === undefined) {
    await db.execute({
      sql: `UPDATE economy_sessions SET status = ? WHERE id = ?`,
      args: [status, economyStateId],
    });
    return;
  }
  await db.execute({
    sql: `UPDATE economy_sessions SET status = ?, current_round_index = ? WHERE id = ?`,
    args: [status, currentRoundIndex, economyStateId],
  });
}

export async function checkTokenBudgetRemaining(
  dataDir: string,
  economyStateId: string,
): Promise<boolean> {
  const state = await loadEconomyState(dataDir, economyStateId);
  return state.tokensUsed < state.config.maxTokenBudget;
}

export async function incrementTokensUsed(
  dataDir: string,
  economyStateId: string,
  delta: number,
): Promise<number> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  await db.execute({
    sql: `UPDATE economy_sessions SET tokens_used = tokens_used + ? WHERE id = ?`,
    args: [delta, economyStateId],
  });
  const state = await loadEconomyState(dataDir, economyStateId);
  return state.tokensUsed;
}

export async function upsertEconomyRound(dataDir: string, round: EconomyRound): Promise<void> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  await db.execute({
    sql: `INSERT INTO economy_rounds (
            session_id, round_index, status, encounter_ids_json, started_at_ms, completed_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id, round_index) DO UPDATE SET
            status = excluded.status,
            encounter_ids_json = excluded.encounter_ids_json,
            started_at_ms = COALESCE(excluded.started_at_ms, economy_rounds.started_at_ms),
            completed_at_ms = COALESCE(excluded.completed_at_ms, economy_rounds.completed_at_ms)`,
    args: [
      round.sessionId,
      round.roundIndex,
      round.status,
      JSON.stringify(round.encounterIds),
      round.startedAtMs ?? null,
      round.completedAtMs ?? null,
    ],
  });
}

export async function loadEconomyRound(
  dataDir: string,
  sessionId: string,
  roundIndex: number,
): Promise<EconomyRound | null> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT session_id, round_index, status, encounter_ids_json, started_at_ms, completed_at_ms
          FROM economy_rounds WHERE session_id = ? AND round_index = ?`,
    args: [sessionId, roundIndex],
  });
  const record = row.rows[0];
  if (!record) return null;
  return {
    sessionId: String(record.session_id),
    roundIndex: Number(record.round_index),
    status: String(record.status) as EconomyRoundStatus,
    encounterIds: JSON.parse(String(record.encounter_ids_json)) as string[],
    ...(record.started_at_ms !== null && record.started_at_ms !== undefined
      ? { startedAtMs: Number(record.started_at_ms) }
      : {}),
    ...(record.completed_at_ms !== null && record.completed_at_ms !== undefined
      ? { completedAtMs: Number(record.completed_at_ms) }
      : {}),
  };
}

export async function insertEconomyEncounter(
  dataDir: string,
  encounter: EconomyEncounter,
): Promise<void> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  await db.execute({
    sql: `INSERT INTO economy_encounters (
            id, session_id, round_index, initiator_did, counterparty_did, chain_id,
            is_repeat, prior_encounter_id, status, turns_completed, tokens_used,
            terminal_outcome, created_at_ms, updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      encounter.id,
      encounter.sessionId,
      encounter.roundIndex,
      encounter.initiatorDid,
      encounter.counterpartyDid,
      encounter.chainId ?? null,
      encounter.isRepeat ? 1 : 0,
      encounter.priorEncounterId ?? null,
      encounter.status,
      encounter.turnsCompleted,
      encounter.tokensUsed,
      encounter.terminalOutcome ?? null,
      encounter.createdAtMs,
      encounter.updatedAtMs,
    ],
  });
}

export async function updateEconomyEncounter(
  dataDir: string,
  encounterId: string,
  patch: Partial<
    Pick<
      EconomyEncounter,
      | "chainId"
      | "status"
      | "turnsCompleted"
      | "tokensUsed"
      | "terminalOutcome"
      | "isRepeat"
      | "priorEncounterId"
    >
  >,
): Promise<EconomyEncounter> {
  await ensureSchema(dataDir);
  const existing = await loadEconomyEncounter(dataDir, encounterId);
  if (existing === null) throw new Error(`economy encounter ${encounterId} not found`);
  const next: EconomyEncounter = {
    ...existing,
    ...patch,
    updatedAtMs: Date.now(),
  };
  const db = getClient(dataDir);
  await db.execute({
    sql: `UPDATE economy_encounters SET
            chain_id = ?, status = ?, turns_completed = ?, tokens_used = ?,
            terminal_outcome = ?, is_repeat = ?, prior_encounter_id = ?, updated_at_ms = ?
          WHERE id = ?`,
    args: [
      next.chainId ?? null,
      next.status,
      next.turnsCompleted,
      next.tokensUsed,
      next.terminalOutcome ?? null,
      next.isRepeat ? 1 : 0,
      next.priorEncounterId ?? null,
      next.updatedAtMs,
      encounterId,
    ],
  });
  return next;
}

export async function loadEconomyEncounter(
  dataDir: string,
  encounterId: string,
): Promise<EconomyEncounter | null> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT * FROM economy_encounters WHERE id = ?`,
    args: [encounterId],
  });
  const record = row.rows[0];
  if (!record) return null;
  return rowToEncounter(record as Record<string, unknown>);
}

export async function listEconomyEncounters(
  dataDir: string,
  sessionId: string,
  opts?: { roundIndex?: number },
): Promise<EconomyEncounter[]> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row =
    opts?.roundIndex === undefined
      ? await db.execute({
          sql: `SELECT * FROM economy_encounters WHERE session_id = ? ORDER BY created_at_ms ASC`,
          args: [sessionId],
        })
      : await db.execute({
          sql: `SELECT * FROM economy_encounters
                WHERE session_id = ? AND round_index = ?
                ORDER BY created_at_ms ASC`,
          args: [sessionId, opts.roundIndex],
        });
  return row.rows.map((r) => rowToEncounter(r as Record<string, unknown>));
}

/** Find the most recent completed encounter for an unordered pair (either orientation). */
export async function findPriorPairEncounter(
  dataDir: string,
  sessionId: string,
  didA: string,
  didB: string,
): Promise<EconomyEncounter | null> {
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT * FROM economy_encounters
          WHERE session_id = ?
            AND status = 'completed'
            AND (
              (initiator_did = ? AND counterparty_did = ?)
              OR (initiator_did = ? AND counterparty_did = ?)
            )
          ORDER BY updated_at_ms DESC
          LIMIT 1`,
    args: [sessionId, didA, didB, didB, didA],
  });
  const record = row.rows[0];
  if (!record) return null;
  return rowToEncounter(record as Record<string, unknown>);
}

export function resetEconomyStateClientForTests(): void {
  clients.clear();
  schemaReadyByDataDir = new Map();
}
