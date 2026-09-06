import type { AgentMemoriesFraming, AgentRecord } from "./store.ts";

/** List-page agent row (no on-disk keyPath). */
export type PoolAgentListItem = {
  did: string;
  externalId?: string;
  memoriesFraming?: AgentMemoriesFraming;
};

export type PoolAgentOrderBy = "did" | "externalId" | "name";

export type PoolAgentQuery = {
  /** Case-insensitive substring over did, externalId, framing name/about/baseUnderstanding. */
  query?: string;
  hasExternalId?: boolean;
  /** Sort field; `name` uses `memoriesFraming.name`. Default `did`. */
  orderBy?: PoolAgentOrderBy;
  /** Default `asc`. */
  order?: "asc" | "desc";
  /** Default 50, max 200. */
  limit?: number;
  /** Default 0. */
  offset?: number;
};

export type PoolAgentPage = {
  agents: PoolAgentListItem[];
  /** Count after filter, before page slice. */
  total: number;
  limit: number;
  offset: number;
};

export const POOL_AGENT_QUERY_DEFAULT_LIMIT = 50;
export const POOL_AGENT_QUERY_MAX_LIMIT = 200;

export function toPoolAgentListItem(record: AgentRecord): PoolAgentListItem {
  return {
    did: record.did,
    ...(record.externalId !== undefined ? { externalId: record.externalId } : {}),
    ...(record.memoriesFraming !== undefined ? { memoriesFraming: record.memoriesFraming } : {}),
  };
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return POOL_AGENT_QUERY_DEFAULT_LIMIT;
  const n = Math.floor(raw);
  if (n < 1) return POOL_AGENT_QUERY_DEFAULT_LIMIT;
  return Math.min(n, POOL_AGENT_QUERY_MAX_LIMIT);
}

function clampOffset(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return 0;
  const n = Math.floor(raw);
  return n < 0 ? 0 : n;
}

function matchesQuery(record: AgentRecord, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystacks = [
    record.did,
    record.externalId ?? "",
    record.memoriesFraming?.name ?? "",
    record.memoriesFraming?.about ?? "",
    record.memoriesFraming?.baseUnderstanding ?? "",
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

function sortKey(record: AgentRecord, orderBy: PoolAgentOrderBy): string | null {
  switch (orderBy) {
    case "did":
      return record.did;
    case "externalId":
      return record.externalId ?? null;
    case "name":
      return record.memoriesFraming?.name ?? "";
  }
}

function compareRecords(
  a: AgentRecord,
  b: AgentRecord,
  orderBy: PoolAgentOrderBy,
  order: "asc" | "desc",
): number {
  const ka = sortKey(a, orderBy);
  const kb = sortKey(b, orderBy);
  // Missing externalId sorts last for asc (first for desc).
  if (orderBy === "externalId") {
    if (ka === null && kb === null) return a.did.localeCompare(b.did);
    if (ka === null) return order === "asc" ? 1 : -1;
    if (kb === null) return order === "asc" ? -1 : 1;
  }
  const left = ka ?? "";
  const right = kb ?? "";
  const cmp = left.localeCompare(right);
  if (cmp !== 0) return order === "asc" ? cmp : -cmp;
  return a.did.localeCompare(b.did);
}

/** Pure filter/sort/page over agent records. */
export function queryPoolAgents(
  records: readonly AgentRecord[],
  opts: PoolAgentQuery = {},
): PoolAgentPage {
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const orderBy = opts.orderBy ?? "did";
  const order = opts.order ?? "asc";
  const needle = opts.query?.trim().toLowerCase() ?? "";

  let filtered = records.filter((r) => {
    if (opts.hasExternalId === true && r.externalId === undefined) return false;
    if (opts.hasExternalId === false && r.externalId !== undefined) return false;
    return matchesQuery(r, needle);
  });

  filtered = [...filtered].sort((a, b) => compareRecords(a, b, orderBy, order));

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map(toPoolAgentListItem);
  return { agents: page, total, limit, offset };
}
