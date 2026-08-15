/**
 * Serializable integrate-memory event wire format.
 * Durable workflow steps stay in the host; this module owns the parse/types.
 *
 * Canonical content is always `features` + `instructions`. Producers (UI text,
 * process-document, deepen) adapt into this shape at the edge.
 */

import type { ResolvedSourceWire } from "@khoralabs/sourcemaps";

import type { MemoriesContextRefs } from "../agent/step-context-sources.ts";
import type { AgentStepContext } from "../agent/types.ts";
import { type IntegrateMemoryWriteScope, parseIntegrateMemoryWriteScope } from "./write-scope.ts";

export type { IntegrateMemoryWriteScope } from "./write-scope.ts";

/**
 * Provenance / adapter prompt kind. Content always comes from `features` +
 * `instructions` — kinds are not a plaintext loading path.
 */
export type IntegrateMemoryEventKind = "interaction" | "document" | "memory";

/** Lexical + vector features for the primary memory content. */
export type IntegrateMemoryFeatures = {
  lexical: string[];
  vector: number[][];
  /** Model id used to produce vectors (optional provenance). */
  embeddingModel?: string;
};

/**
 * Feature-centric integrate-memory event.
 *
 * - Domain ingest (`interaction` / `document`): expand → extract → merge.
 * - Deepen (`memory`): skip expand; extract + merge onto `memoryKey`.
 */
export type IntegrateMemoryEvent = {
  kind: IntegrateMemoryEventKind;
  /** Memories DB owner key (`{ kind: "account", ownerKey }`), usually the agent DID. */
  ownerKey: string;
  /** Namespace path (caller-owned; e.g. `notes` or `team/docs`). */
  namespace: string;
  /**
   * Write target relative to `namespace`. Omit or `exact` keeps leaf writes.
   * `under` lets the workflow choose a child. `cross` allows any namespace in the DB.
   */
  writeScope?: IntegrateMemoryWriteScope;
  /**
   * Existing memory key within `namespace`. Required when `kind === "memory"`.
   */
  memoryKey?: string;
  /** Idempotency / provenance correlation id. */
  correlationId: string;
  occurredAtMs: number;
  /** Serializable provenance / source metadata. */
  payload: Record<string, unknown>;
  /** Required primary content features (producers embed before enqueue). */
  features: IntegrateMemoryFeatures;
  /** Guidance for expand/extract (not the sole stored content). */
  instructions: string;
  /**
   * @deprecated Prefer `features.lexical` / `instructions`. Accepted on parse
   * for in-flight events; ignored when `features` is present.
   */
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

function parseFeatures(raw: unknown, legacyText?: string): IntegrateMemoryFeatures {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const f = raw as Record<string, unknown>;
    const lexical = Array.isArray(f.lexical)
      ? f.lexical.filter((x): x is string => typeof x === "string")
      : [];
    const vector: number[][] = [];
    if (Array.isArray(f.vector)) {
      for (const row of f.vector) {
        if (!Array.isArray(row)) {
          throw new Error("features.vector rows must be arrays");
        }
        const nums: number[] = [];
        for (const n of row) {
          if (typeof n !== "number" || !Number.isFinite(n)) {
            throw new Error("features.vector must contain finite numbers");
          }
          nums.push(n);
        }
        if (nums.length === 0) {
          throw new Error("features.vector rows must be non-empty");
        }
        vector.push(nums);
      }
    }
    if (lexical.length === 0 && vector.length === 0) {
      throw new Error("features must include at least one lexical or vector row");
    }
    const embeddingModel =
      typeof f.embeddingModel === "string" && f.embeddingModel.trim().length > 0
        ? f.embeddingModel.trim()
        : undefined;
    return {
      lexical,
      vector,
      ...(embeddingModel !== undefined ? { embeddingModel } : {}),
    };
  }

  // Legacy: text-only events (pre-features). Vector empty — caller/workflow embeds.
  if (legacyText !== undefined && legacyText.trim().length > 0) {
    return { lexical: [legacyText.trim()], vector: [] };
  }

  throw new Error("features is required");
}

export function joinIntegrateLexical(features: IntegrateMemoryFeatures): string {
  return features.lexical
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("\n\n");
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
  const legacyText =
    typeof raw.text === "string" && raw.text.trim().length > 0 ? raw.text.trim() : undefined;
  const features = parseFeatures(raw.features, legacyText);
  const instructions = typeof raw.instructions === "string" ? raw.instructions.trim() : "";
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
    features,
    instructions,
    ...(legacyText !== undefined ? { text: legacyText } : {}),
    ...(memoriesContextRefs !== undefined ? { memoriesContextRefs } : {}),
    ...(contextSourceWire !== undefined ? { contextSourceWire } : {}),
    ...(stepContext !== undefined ? { stepContext } : {}),
  };
}
