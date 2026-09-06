import { describe, expect, test } from "bun:test";

import {
  POOL_AGENT_QUERY_DEFAULT_LIMIT,
  POOL_AGENT_QUERY_MAX_LIMIT,
  queryPoolAgents,
} from "./query.ts";
import type { AgentRecord } from "./store.ts";

function rec(
  did: string,
  opts?: { externalId?: string; name?: string; about?: string },
): AgentRecord {
  return {
    did,
    keyPath: `/keys/${did}.json`,
    ...(opts?.externalId !== undefined ? { externalId: opts.externalId } : {}),
    ...(opts?.name !== undefined || opts?.about !== undefined
      ? {
          memoriesFraming: {
            ...(opts.name !== undefined ? { name: opts.name } : {}),
            ...(opts.about !== undefined ? { about: opts.about } : {}),
          },
        }
      : {}),
  };
}

const sample: AgentRecord[] = [
  rec("did:key:z", { externalId: "tenant-z", name: "Zebra Co" }),
  rec("did:key:a", { name: "Alpha Co", about: "first tenant" }),
  rec("did:key:m", { externalId: "mid-id", name: "Mid Co" }),
];

describe("queryPoolAgents", () => {
  test("defaults: sort by did asc, default limit, omits keyPath", () => {
    const page = queryPoolAgents(sample);
    expect(page.total).toBe(3);
    expect(page.limit).toBe(POOL_AGENT_QUERY_DEFAULT_LIMIT);
    expect(page.offset).toBe(0);
    expect(page.agents.map((a) => a.did)).toEqual(["did:key:a", "did:key:m", "did:key:z"]);
    const first = page.agents[0];
    expect(first).toEqual({
      did: "did:key:a",
      memoriesFraming: { name: "Alpha Co", about: "first tenant" },
    });
    expect(first !== undefined && "keyPath" in first).toBe(false);
  });

  test("query substring matches did, externalId, and framing fields", () => {
    expect(queryPoolAgents(sample, { query: "Zebra" }).agents.map((a) => a.did)).toEqual([
      "did:key:z",
    ]);
    expect(queryPoolAgents(sample, { query: "MID-ID" }).agents.map((a) => a.did)).toEqual([
      "did:key:m",
    ]);
    expect(queryPoolAgents(sample, { query: "first tenant" }).agents.map((a) => a.did)).toEqual([
      "did:key:a",
    ]);
  });

  test("hasExternalId filter", () => {
    expect(queryPoolAgents(sample, { hasExternalId: true }).total).toBe(2);
    expect(queryPoolAgents(sample, { hasExternalId: false }).agents.map((a) => a.did)).toEqual([
      "did:key:a",
    ]);
  });

  test("orderBy externalId puts missing last on asc", () => {
    const page = queryPoolAgents(sample, { orderBy: "externalId", order: "asc" });
    expect(page.agents.map((a) => a.did)).toEqual(["did:key:m", "did:key:z", "did:key:a"]);
  });

  test("orderBy name desc", () => {
    const page = queryPoolAgents(sample, { orderBy: "name", order: "desc" });
    expect(page.agents.map((a) => a.did)).toEqual(["did:key:z", "did:key:m", "did:key:a"]);
  });

  test("offset/limit and total after filter", () => {
    const page = queryPoolAgents(sample, { limit: 1, offset: 1, orderBy: "did" });
    expect(page.total).toBe(3);
    expect(page.limit).toBe(1);
    expect(page.offset).toBe(1);
    expect(page.agents.map((a) => a.did)).toEqual(["did:key:m"]);
  });

  test("clamps limit to max and offset to >= 0", () => {
    expect(queryPoolAgents(sample, { limit: 999 }).limit).toBe(POOL_AGENT_QUERY_MAX_LIMIT);
    expect(queryPoolAgents(sample, { offset: -5 }).offset).toBe(0);
  });
});
