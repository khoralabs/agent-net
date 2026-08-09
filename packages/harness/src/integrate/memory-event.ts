/**
 * Serializable integrate-memory event wire format.
 * Durable workflow steps stay in the host; this module owns the parse/types.
 */

import type { ResolvedSourceWire } from "@khoralabs/sourcemaps";

import type { MemoriesContextRefs } from "../agent/step-context-sources.ts";
import type { AgentStepContext } from "../agent/types.ts";
import { type IntegrateMemoryWriteScope, parseIntegrateMemoryWriteScope } from "./write-scope.ts";

export type { IntegrateMemoryWriteScope } from "./write-scope.ts";

/** Serializable event kinds. `document` is reserved for a future task. */
export type IntegrateMemoryEventKind = "interaction" | "document" | "memory";

/**
 * Base namespace path in each agent’s own memories DB.
 * Host-specific leaves (e.g. platform sync) live under `_root_/…`.
 */
export const MEMORIES_NAMESPACE_ROOT = "_root_";

/**
 * Abstract integrate-memory event port.
 * Serializable only — no binary/document bytes (documents land in a later task).
 *
 * - `interaction` / `document`: domain-event ingest (expand → extract → merge).
 * - `memory`: deepen an existing node at `namespace`/`memoryKey` (skip expand;
 *   extract + merge; caller-owned `writeScope`).
 */
export type IntegrateMemoryEvent = {
  kind: IntegrateMemoryEventKind;
  /** Memories DB owner key (`{ kind: "account", ownerKey }`), usually the agent DID. */
  ownerKey: string;
  /** Namespace path, e.g. `_root_` or `_root_/platform/company`. */
  namespace: string;
  /**
   * Write target relative to `namespace`. Omit or `exact` keeps leaf writes.
   * `under` lets the workflow choose a child. `cross` allows any namespace in the DB.
   * Always caller-owned for every kind (including `memory`).
   */
  writeScope?: IntegrateMemoryWriteScope;
  /**
   * Existing memory key within `namespace`. Required when `kind === "memory"`.
   */
  memoryKey?: string;
  /** Idempotency / provenance correlation id. */
  correlationId: string;
  occurredAtMs: number;
  /** Serializable, kind-specific body. */
  payload: Record<string, unknown>;
  /** Pre-extracted plaintext when available (content only — not source prose). */
  text?: string;
  /** Memories-domain sourcemap addresses (database / namespace catalog). */
  memoriesContextRefs?: MemoriesContextRefs;
  /**
   * Opaque frozen source original (sourcemaps wire). Domain string is host-owned
   * (e.g. host `connection`); harness does not interpret it.
   */
  contextSourceWire?: ResolvedSourceWire;
  /** Preferred: host-gathered LLM projection for this ingest. */
  stepContext?: AgentStepContext;
};

function parseOwnerKey(raw: Record<string, unknown>): string {
  if (typeof raw.ownerKey === "string" && raw.ownerKey.trim().length > 0) {
    return raw.ownerKey.trim();
  }
  // Legacy wire alias from when the field was named `companyId`.
  if (typeof raw.companyId === "string" && raw.companyId.trim().length > 0) {
    return raw.companyId.trim();
  }
  return "";
}

function parseOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function parseIntegrateMemoryEvent(body: unknown): IntegrateMemoryEvent {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("event body must be an object");
  }
  const raw = body as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== "interaction" && kind !== "document" && kind !== "memory") {
    throw new Error('kind must be "interaction", "document", or "memory"');
  }
  const ownerKey = parseOwnerKey(raw);
  const namespace = typeof raw.namespace === "string" ? raw.namespace.trim() : "";
  const correlationId = typeof raw.correlationId === "string" ? raw.correlationId.trim() : "";
  const occurredAtMs =
    typeof raw.occurredAtMs === "number" && Number.isFinite(raw.occurredAtMs)
      ? raw.occurredAtMs
      : Number.NaN;
  if (ownerKey.length === 0) throw new Error("ownerKey is required");
  if (namespace.length === 0) throw new Error("namespace is required");
  if (correlationId.length === 0) throw new Error("correlationId is required");
  if (!Number.isFinite(occurredAtMs)) {
    throw new Error("occurredAtMs is required");
  }
  if (raw.payload === null || typeof raw.payload !== "object" || Array.isArray(raw.payload)) {
    throw new Error("payload must be an object");
  }
  let writeScope: IntegrateMemoryWriteScope | undefined;
  if (raw.writeScope !== undefined) {
    writeScope = parseIntegrateMemoryWriteScope(raw.writeScope);
  }
  const memoryKeyRaw = typeof raw.memoryKey === "string" ? raw.memoryKey.trim() : "";
  if (kind === "memory" && memoryKeyRaw.length === 0) {
    throw new Error('memoryKey is required when kind is "memory"');
  }
  const text =
    typeof raw.text === "string" && raw.text.trim().length > 0 ? raw.text.trim() : undefined;
  // Accept legacy `contextRefs` as memories-only refs when present.
  const memoriesContextRefs = (parseOptionalObject(raw.memoriesContextRefs) ??
    parseOptionalObject(raw.contextRefs)) as MemoriesContextRefs | undefined;
  const contextSourceWire = parseOptionalObject(raw.contextSourceWire) as
    | ResolvedSourceWire
    | undefined;
  const stepContext = parseOptionalObject(raw.stepContext) as AgentStepContext | undefined;
  return {
    kind,
    ownerKey,
    namespace,
    ...(writeScope !== undefined ? { writeScope } : {}),
    ...(memoryKeyRaw.length > 0 ? { memoryKey: memoryKeyRaw } : {}),
    correlationId,
    occurredAtMs,
    payload: raw.payload as Record<string, unknown>,
    ...(text !== undefined ? { text } : {}),
    ...(memoriesContextRefs !== undefined ? { memoriesContextRefs } : {}),
    ...(contextSourceWire !== undefined ? { contextSourceWire } : {}),
    ...(stepContext !== undefined ? { stepContext } : {}),
  };
}
