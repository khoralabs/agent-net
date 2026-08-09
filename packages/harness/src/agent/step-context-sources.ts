/**
 * Memories-adjacent sourcemap domains for AgentStepContext gather.
 * Host apps implement Stores; host-specific source domains live outside harness.
 */

import type { ResolvedSource, SourceRef, Store } from "@khoralabs/sourcemaps";

import type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
  MemoriesDatabaseContext,
} from "./types.ts";

export const AGENT_DATABASE_DOMAIN = "agent-database" as const;
export const NAMESPACE_CATALOG_DOMAIN = "namespace-catalog" as const;

export type AgentDatabaseLocators = {
  domain: typeof AGENT_DATABASE_DOMAIN;
  owner_key: string;
};

export type NamespaceCatalogLocators = {
  domain: typeof NAMESPACE_CATALOG_DOMAIN;
  owner_key: string;
};

export type AgentDatabaseSourceRef = SourceRef<AgentDatabaseLocators>;
export type NamespaceCatalogSourceRef = SourceRef<NamespaceCatalogLocators>;

export type AgentDatabaseEntity = MemoriesDatabaseContext;

export type NamespaceCatalogEntity = {
  namespaces: AgentStepNamespaceEntry[];
};

export type AgentDatabaseEntityMap = {
  [AGENT_DATABASE_DOMAIN]: AgentDatabaseEntity;
};

export type NamespaceCatalogEntityMap = {
  [NAMESPACE_CATALOG_DOMAIN]: NamespaceCatalogEntity;
};

export type AgentDatabaseStore = Store<AgentDatabaseSourceRef, AgentDatabaseEntityMap>;
export type NamespaceCatalogStore = Store<NamespaceCatalogSourceRef, NamespaceCatalogEntityMap>;

/** Memories-only sourcemap addresses carried on integrate events. */
export type MemoriesContextRefs = {
  database?: AgentDatabaseSourceRef;
  namespaces?: NamespaceCatalogSourceRef;
};

export function agentDatabaseSourceRef(ownerKey: string): AgentDatabaseSourceRef {
  return { domain: AGENT_DATABASE_DOMAIN, owner_key: ownerKey.trim() };
}

export function namespaceCatalogSourceRef(ownerKey: string): NamespaceCatalogSourceRef {
  return { domain: NAMESPACE_CATALOG_DOMAIN, owner_key: ownerKey.trim() };
}

export function isAgentDatabaseSourceRef(value: unknown): value is AgentDatabaseSourceRef {
  if (value === null || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return (
    ref.domain === AGENT_DATABASE_DOMAIN &&
    typeof ref.owner_key === "string" &&
    ref.owner_key.trim().length > 0
  );
}

export function isNamespaceCatalogSourceRef(value: unknown): value is NamespaceCatalogSourceRef {
  if (value === null || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return (
    ref.domain === NAMESPACE_CATALOG_DOMAIN &&
    typeof ref.owner_key === "string" &&
    ref.owner_key.trim().length > 0
  );
}

function asRecord<D extends string, V>(
  resolved: ResolvedSource<Record<D, V>>,
  domain: D,
): V | undefined {
  if (resolved.kind !== "record" || resolved.domain !== domain) return undefined;
  return resolved.value as V;
}

/** Pure merge of already-resolved facets into an {@link AgentStepContext}. */
export function mergeAgentStepContextFacets(input: {
  database?: MemoriesDatabaseContext;
  namespaces?: AgentStepNamespaceEntry[];
  source?: AgentStepSourceContext;
  turn?: { instructions?: string[] };
}): AgentStepContext | undefined {
  const hasNamespaces = (input.namespaces?.length ?? 0) > 0;
  const hasTurn = (input.turn?.instructions?.length ?? 0) > 0;
  if (input.database === undefined && !hasNamespaces && input.source === undefined && !hasTurn) {
    return undefined;
  }
  return {
    ...(input.database !== undefined ? { database: input.database } : {}),
    ...(hasNamespaces ? { namespaces: input.namespaces } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(hasTurn ? { turn: input.turn } : {}),
  };
}

/**
 * Resolve memories-domain refs into database / namespace facets.
 * Host supplies Stores; source/turn are passed through already projected.
 */
export async function resolveMemoriesStepContextFacets(
  refs: MemoriesContextRefs,
  stores: {
    database?: AgentDatabaseStore;
    namespaces?: NamespaceCatalogStore;
  },
): Promise<{
  database?: MemoriesDatabaseContext;
  namespaces?: AgentStepNamespaceEntry[];
}> {
  let database: MemoriesDatabaseContext | undefined;
  let namespaces: AgentStepNamespaceEntry[] | undefined;

  if (refs.database !== undefined && stores.database !== undefined) {
    const resolved = await stores.database.resolve(refs.database);
    database = asRecord(resolved, AGENT_DATABASE_DOMAIN);
  }

  if (refs.namespaces !== undefined && stores.namespaces !== undefined) {
    const resolved = await stores.namespaces.resolve(refs.namespaces);
    const entity = asRecord(resolved, NAMESPACE_CATALOG_DOMAIN);
    if (entity !== undefined) {
      namespaces = entity.namespaces;
    }
  }

  return {
    ...(database !== undefined ? { database } : {}),
    ...(namespaces !== undefined ? { namespaces } : {}),
  };
}
