/**
 * Per-agent encounter experience index: immutable summaries + offer/port repertoire.
 * Exact chain content stays in Vellum; this stores searchable provenance only.
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import { type Client, createClient } from "@libsql/client";

import { emitNetworkEvent, networkEventId } from "../index.ts";

import type { EconomyEncounter } from "./types.ts";

export const ECONOMY_ENCOUNTERS_NAMESPACE = "economy/encounters";

export type EconomyOfferPortSummary = {
  offerId?: string;
  portId?: string;
  offerType?: string;
  portKind?: string;
  polarity?: "expose" | "bind";
  promise?: string;
  bindPayload?: unknown;
  /** Canonicalized bind-policy hash when available. */
  bindPolicyHash?: string;
  portAtomRef?: string;
};

export type EconomyExperienceRecord = {
  id: string;
  sessionId: string;
  agentDid: string;
  peerDid: string;
  encounterId: string;
  roundIndex: number;
  role: "initiator" | "counterparty";
  chainId?: string;
  isRepeat: boolean;
  priorEncounterId?: string;
  terminalOutcome?: string;
  turnsCompleted: number;
  tokensUsed: number;
  relationshipRef?: string;
  circumstances?: unknown;
  provenance: {
    source: "vellum-snapshot" | "host";
    chainId?: string;
    vellumSessionId?: string;
    observedAtMs: number;
  };
  offers: EconomyOfferPortSummary[];
  createdAtMs: number;
};

export type EconomyRepertoireEntry = {
  agentDid: string;
  key: string;
  offerType?: string;
  portKind?: string;
  polarity?: "expose" | "bind";
  bindPolicyHash?: string;
  usageCount: number;
  chainRefs: string[];
  experienceRefs: string[];
  circumstances: unknown[];
  updatedAtMs: number;
};

export type IndexEconomyExperienceInput = {
  dataDir: string;
  sessionId: string;
  encounter: EconomyEncounter;
  relationshipRef?: string;
  /** Visible offer/port atoms observed on the chain (host-supplied). */
  offersByAgent?: Record<string, EconomyOfferPortSummary[]>;
  /** Preferred source: actual Vellum/OBP graph. */
  graph?: NbcChainGraph;
  circumstancesByAgent?: Record<string, unknown>;
  vellumSessionId?: string;
  /** Optional private memory writer — never receives peer objectives. */
  writeMemory?: (input: {
    agentDid: string;
    namespace: string;
    text: string;
    record: EconomyExperienceRecord;
  }) => Promise<void>;
};

let schemaReadyByDataDir = new Map<string, Promise<void>>();
const clients = new Map<string, Client>();

function workflowDbPath(dataDir: string): string {
  return path.join(dataDir, "workflow.db");
}

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
      CREATE TABLE IF NOT EXISTS economy_experience (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_did TEXT NOT NULL,
        peer_did TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        round_index INTEGER NOT NULL,
        role TEXT NOT NULL,
        chain_id TEXT,
        is_repeat INTEGER NOT NULL,
        prior_encounter_id TEXT,
        terminal_outcome TEXT,
        turns_completed INTEGER NOT NULL,
        tokens_used INTEGER NOT NULL,
        relationship_ref TEXT,
        circumstances_json TEXT,
        provenance_json TEXT NOT NULL DEFAULT '{}',
        offers_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS economy_experience_agent
      ON economy_experience (session_id, agent_did, created_at_ms)
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS economy_repertoire (
        session_id TEXT NOT NULL,
        agent_did TEXT NOT NULL,
        entry_key TEXT NOT NULL,
        offer_type TEXT,
        port_kind TEXT,
        polarity TEXT,
        bind_policy_hash TEXT,
        usage_count INTEGER NOT NULL,
        chain_refs_json TEXT NOT NULL,
        experience_refs_json TEXT NOT NULL DEFAULT '[]',
        circumstances_json TEXT NOT NULL DEFAULT '[]',
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (session_id, agent_did, entry_key)
      )
    `);
    for (const sql of [
      "ALTER TABLE economy_experience ADD COLUMN circumstances_json TEXT",
      "ALTER TABLE economy_experience ADD COLUMN provenance_json TEXT NOT NULL DEFAULT '{}'",
      "ALTER TABLE economy_repertoire ADD COLUMN experience_refs_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE economy_repertoire ADD COLUMN circumstances_json TEXT NOT NULL DEFAULT '[]'",
    ]) {
      await db.execute(sql).catch((error) => {
        if (!String(error).includes("duplicate column")) throw error;
      });
    }
  })().catch((err) => {
    schemaReadyByDataDir.delete(dataDir);
    throw err;
  });
  schemaReadyByDataDir.set(dataDir, ready);
  return ready;
}

export function repertoireEntryKey(summary: EconomyOfferPortSummary): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        offerType: summary.offerType ?? "",
        portKind: summary.portKind ?? "",
        polarity: summary.polarity ?? "",
        bindPolicyHash: summary.bindPolicyHash ?? "",
        portAtomRef: summary.portAtomRef ?? "",
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

function policyHash(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

/** Extract only protocol facts present in the immutable Vellum/OBP snapshot. */
export function extractEconomyOffersByAgent(
  graph: NbcChainGraph,
): Record<string, EconomyOfferPortSummary[]> {
  const byAgent: Record<string, EconomyOfferPortSummary[]> = {};
  const offers = new Map(graph.offers.map((offer) => [offer.id, offer]));
  const ports = new Map(graph.ports.map((port) => [port.id, port]));
  const add = (did: string, summary: EconomyOfferPortSummary) => {
    const entries = byAgent[did] ?? [];
    entries.push(summary);
    byAgent[did] = entries;
  };

  for (const offer of graph.offers) {
    const exposed = graph.ports.filter((port) => port.exposedOnOfferIds.includes(offer.id));
    if (exposed.length === 0) {
      add(offer.partyId, { offerId: offer.id, offerType: offer.type, polarity: "expose" });
    }
    for (const port of exposed) {
      add(offer.partyId, {
        offerId: offer.id,
        portId: port.id,
        offerType: offer.type,
        portKind: port.kind,
        polarity: "expose",
        promise: port.promise,
        bindPolicyHash: policyHash(port.bind_policy),
        portAtomRef: port.ref,
      });
    }
  }
  for (const bind of graph.binds) {
    const offer = offers.get(bind.offerId);
    const port = ports.get(bind.portId);
    if (offer === undefined) continue;
    add(offer.partyId, {
      offerId: bind.offerId,
      portId: bind.portId,
      offerType: offer.type,
      portKind: port?.kind,
      polarity: "bind",
      promise: port?.promise,
      bindPolicyHash: policyHash(port?.bind_policy),
      portAtomRef: port?.ref,
      bindPayload: bind.bind_payload,
    });
  }
  return byAgent;
}

function formatExperienceMemory(record: EconomyExperienceRecord): string {
  const offers = record.offers
    .map((o) =>
      [o.polarity, o.offerType, o.portKind, o.bindPolicyHash]
        .filter((x) => x !== undefined && String(x).length > 0)
        .join("/"),
    )
    .filter((s) => s.length > 0)
    .join(", ");
  return [
    `encounter ${record.encounterId}`,
    `peer ${record.peerDid}`,
    `role ${record.role}`,
    `round ${record.roundIndex}`,
    record.isRepeat ? "repeat" : "first",
    record.chainId !== undefined ? `chain ${record.chainId}` : undefined,
    record.terminalOutcome !== undefined ? `outcome ${record.terminalOutcome}` : undefined,
    `turns ${record.turnsCompleted}`,
    offers.length > 0 ? `offers ${offers}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

async function upsertRepertoire(
  dataDir: string,
  sessionId: string,
  agentDid: string,
  chainId: string | undefined,
  experienceId: string,
  circumstances: unknown,
  offers: EconomyOfferPortSummary[],
): Promise<EconomyRepertoireEntry[]> {
  const db = getClient(dataDir);
  const now = Date.now();
  const updated: EconomyRepertoireEntry[] = [];
  for (const offer of offers) {
    const key = repertoireEntryKey(offer);
    const existing = await db.execute({
      sql: `SELECT usage_count, chain_refs_json, experience_refs_json, circumstances_json
            FROM economy_repertoire
            WHERE session_id = ? AND agent_did = ? AND entry_key = ?`,
      args: [sessionId, agentDid, key],
    });
    const row = existing.rows[0];
    const prevCount = row !== undefined ? Number(row.usage_count) : 0;
    const prevRefs = row !== undefined ? (JSON.parse(String(row.chain_refs_json)) as string[]) : [];
    const prevExperienceRefs =
      row !== undefined ? (JSON.parse(String(row.experience_refs_json)) as string[]) : [];
    const prevCircumstances =
      row !== undefined ? (JSON.parse(String(row.circumstances_json)) as unknown[]) : [];
    const chainRefs =
      chainId !== undefined && !prevRefs.includes(chainId) ? [...prevRefs, chainId] : prevRefs;
    const experienceRefs = [...prevExperienceRefs, experienceId];
    const circumstanceRows =
      circumstances === undefined ? prevCircumstances : [...prevCircumstances, circumstances];
    await db.execute({
      sql: `INSERT INTO economy_repertoire (
              session_id, agent_did, entry_key, offer_type, port_kind, polarity,
              bind_policy_hash, usage_count, chain_refs_json, experience_refs_json,
              circumstances_json, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, agent_did, entry_key) DO UPDATE SET
              usage_count = excluded.usage_count,
              chain_refs_json = excluded.chain_refs_json,
              experience_refs_json = excluded.experience_refs_json,
              circumstances_json = excluded.circumstances_json,
              updated_at_ms = excluded.updated_at_ms`,
      args: [
        sessionId,
        agentDid,
        key,
        offer.offerType ?? null,
        offer.portKind ?? null,
        offer.polarity ?? null,
        offer.bindPolicyHash ?? null,
        prevCount + 1,
        JSON.stringify(chainRefs),
        JSON.stringify(experienceRefs),
        JSON.stringify(circumstanceRows),
        now,
      ],
    });
    updated.push({
      agentDid,
      key,
      offerType: offer.offerType,
      portKind: offer.portKind,
      polarity: offer.polarity,
      bindPolicyHash: offer.bindPolicyHash,
      usageCount: prevCount + 1,
      chainRefs,
      experienceRefs,
      circumstances: circumstanceRows,
      updatedAtMs: now,
    });
  }
  return updated;
}

export async function indexEconomyExperience(
  input: IndexEconomyExperienceInput,
): Promise<EconomyExperienceRecord[]> {
  await ensureSchema(input.dataDir);
  const { encounter, sessionId, dataDir } = input;
  const sides: Array<{
    agentDid: string;
    peerDid: string;
    role: "initiator" | "counterparty";
  }> = [
    {
      agentDid: encounter.initiatorDid,
      peerDid: encounter.counterpartyDid,
      role: "initiator",
    },
    {
      agentDid: encounter.counterpartyDid,
      peerDid: encounter.initiatorDid,
      role: "counterparty",
    },
  ];

  const records: EconomyExperienceRecord[] = [];
  const db = getClient(dataDir);
  const now = Date.now();
  const extractedOffers =
    input.graph !== undefined ? extractEconomyOffersByAgent(input.graph) : input.offersByAgent;

  for (const side of sides) {
    const offers = extractedOffers?.[side.agentDid] ?? [];
    const circumstances = input.circumstancesByAgent?.[side.agentDid];
    const record: EconomyExperienceRecord = {
      id: crypto.randomUUID(),
      sessionId,
      agentDid: side.agentDid,
      peerDid: side.peerDid,
      encounterId: encounter.id,
      roundIndex: encounter.roundIndex,
      role: side.role,
      ...(encounter.chainId !== undefined ? { chainId: encounter.chainId } : {}),
      isRepeat: encounter.isRepeat,
      ...(encounter.priorEncounterId !== undefined
        ? { priorEncounterId: encounter.priorEncounterId }
        : {}),
      ...(encounter.terminalOutcome !== undefined
        ? { terminalOutcome: encounter.terminalOutcome }
        : {}),
      turnsCompleted: encounter.turnsCompleted,
      tokensUsed: encounter.tokensUsed,
      ...(input.relationshipRef !== undefined ? { relationshipRef: input.relationshipRef } : {}),
      ...(circumstances !== undefined ? { circumstances } : {}),
      provenance: {
        source: input.graph !== undefined ? "vellum-snapshot" : "host",
        ...(encounter.chainId !== undefined ? { chainId: encounter.chainId } : {}),
        ...(input.vellumSessionId !== undefined ? { vellumSessionId: input.vellumSessionId } : {}),
        observedAtMs: now,
      },
      offers,
      createdAtMs: now,
    };

    await db.execute({
      sql: `INSERT INTO economy_experience (
              id, session_id, agent_did, peer_did, encounter_id, round_index, role,
              chain_id, is_repeat, prior_encounter_id, terminal_outcome, turns_completed,
              tokens_used, relationship_ref, circumstances_json, provenance_json,
              offers_json, created_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        record.id,
        record.sessionId,
        record.agentDid,
        record.peerDid,
        record.encounterId,
        record.roundIndex,
        record.role,
        record.chainId ?? null,
        record.isRepeat ? 1 : 0,
        record.priorEncounterId ?? null,
        record.terminalOutcome ?? null,
        record.turnsCompleted,
        record.tokensUsed,
        record.relationshipRef ?? null,
        record.circumstances === undefined ? null : JSON.stringify(record.circumstances),
        JSON.stringify(record.provenance),
        JSON.stringify(record.offers),
        record.createdAtMs,
      ],
    });

    const repertoire = await upsertRepertoire(
      dataDir,
      sessionId,
      side.agentDid,
      encounter.chainId,
      record.id,
      circumstances,
      offers,
    );

    if (input.writeMemory !== undefined) {
      await input.writeMemory({
        agentDid: side.agentDid,
        namespace: ECONOMY_ENCOUNTERS_NAMESPACE,
        text: formatExperienceMemory(record),
        record,
      });
    }

    await emitNetworkEvent({
      eventId: networkEventId({
        sessionId,
        kind: "economy.experience.indexed",
        agentDid: side.agentDid,
        extra: record.id,
      }),
      sessionId,
      tsMs: now,
      source: "economy",
      kind: "economy.experience.indexed",
      agentDid: side.agentDid,
      message: "Economy encounter experience indexed",
      payload: {
        experienceId: record.id,
        encounterId: record.encounterId,
        peerDid: record.peerDid,
        role: record.role,
        roundIndex: record.roundIndex,
        isRepeat: record.isRepeat,
        chainId: record.chainId,
        terminalOutcome: record.terminalOutcome,
        turnsCompleted: record.turnsCompleted,
        relationshipRef: record.relationshipRef,
        repertoireKeys: repertoire.map((r) => r.key),
        offerCount: offers.length,
      },
    });

    records.push(record);
  }

  return records;
}

export async function listEconomyExperience(
  dataDir: string,
  sessionId: string,
  agentDid: string,
  options?: { peerDid?: string; terminalOutcome?: string; limit?: number },
): Promise<EconomyExperienceRecord[]> {
  if (options?.limit !== undefined && options.limit <= 0) return [];
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT * FROM economy_experience
          WHERE session_id = ? AND agent_did = ?
          ORDER BY created_at_ms ASC`,
    args: [sessionId, agentDid],
  });
  const records = row.rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    agentDid: String(r.agent_did),
    peerDid: String(r.peer_did),
    encounterId: String(r.encounter_id),
    roundIndex: Number(r.round_index),
    role: String(r.role) as "initiator" | "counterparty",
    ...(r.chain_id != null ? { chainId: String(r.chain_id) } : {}),
    isRepeat: Number(r.is_repeat) === 1,
    ...(r.prior_encounter_id != null ? { priorEncounterId: String(r.prior_encounter_id) } : {}),
    ...(r.terminal_outcome != null ? { terminalOutcome: String(r.terminal_outcome) } : {}),
    turnsCompleted: Number(r.turns_completed),
    tokensUsed: Number(r.tokens_used),
    ...(r.relationship_ref != null ? { relationshipRef: String(r.relationship_ref) } : {}),
    ...(r.circumstances_json != null
      ? { circumstances: JSON.parse(String(r.circumstances_json)) }
      : {}),
    provenance: JSON.parse(String(r.provenance_json)) as EconomyExperienceRecord["provenance"],
    offers: JSON.parse(String(r.offers_json)) as EconomyOfferPortSummary[],
    createdAtMs: Number(r.created_at_ms),
  }));
  return records
    .filter(
      (record) =>
        (options?.peerDid === undefined || record.peerDid === options.peerDid) &&
        (options?.terminalOutcome === undefined ||
          record.terminalOutcome === options.terminalOutcome),
    )
    .slice(-(options?.limit ?? records.length));
}

export async function listEconomyRepertoire(
  dataDir: string,
  sessionId: string,
  agentDid: string,
  options?: { minUsageCount?: number; limit?: number },
): Promise<EconomyRepertoireEntry[]> {
  if (options?.limit !== undefined && options.limit <= 0) return [];
  await ensureSchema(dataDir);
  const db = getClient(dataDir);
  const row = await db.execute({
    sql: `SELECT * FROM economy_repertoire
          WHERE session_id = ? AND agent_did = ?
          ORDER BY updated_at_ms ASC`,
    args: [sessionId, agentDid],
  });
  const entries = row.rows.map((r) => ({
    agentDid: String(r.agent_did),
    key: String(r.entry_key),
    ...(r.offer_type != null ? { offerType: String(r.offer_type) } : {}),
    ...(r.port_kind != null ? { portKind: String(r.port_kind) } : {}),
    ...(r.polarity != null ? { polarity: String(r.polarity) as "expose" | "bind" } : {}),
    ...(r.bind_policy_hash != null ? { bindPolicyHash: String(r.bind_policy_hash) } : {}),
    usageCount: Number(r.usage_count),
    chainRefs: JSON.parse(String(r.chain_refs_json)) as string[],
    experienceRefs: JSON.parse(String(r.experience_refs_json)) as string[],
    circumstances: JSON.parse(String(r.circumstances_json)) as unknown[],
    updatedAtMs: Number(r.updated_at_ms),
  }));
  return entries
    .filter((entry) => entry.usageCount >= (options?.minUsageCount ?? 0))
    .slice(-(options?.limit ?? entries.length));
}

export function resetEconomyExperienceClientForTests(): void {
  clients.clear();
  schemaReadyByDataDir = new Map();
}
