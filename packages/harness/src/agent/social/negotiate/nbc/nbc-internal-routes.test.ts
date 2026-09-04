import { describe, expect, test } from "bun:test";
import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import { NBC_GENESIS_NOT_INITIATOR } from "../vellum-sessions.ts";
import {
  type NbcInternalNegotiationChain,
  type NbcInternalNegotiationHost,
  registerNbcInternalNegotiationRoutes,
} from "./nbc-internal-routes.ts";

const MESH_TOKEN = "mesh-secret";

function emptyGraph(): NbcChainGraph {
  return {
    parties: [],
    offers: [],
    ports: [],
    extends: [],
    exposes: [],
    binds: [],
  };
}

function requireAuth(req: Request): Response | null {
  const header = req.headers.get("authorization")?.trim() ?? "";
  if (header !== `Bearer ${MESH_TOKEN}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function req(
  url: string,
  auth?: string,
  init?: RequestInit,
): Request & { params: { chainId: string } } {
  const headers = new Headers(init?.headers);
  if (auth !== undefined) headers.set("Authorization", `Bearer ${auth}`);
  const base = new Request(url, { ...init, headers });
  return Object.assign(base, { params: { chainId: "c1" } });
}

function createMemoryHost(initial: NbcInternalNegotiationChain[]): {
  host: NbcInternalNegotiationHost;
  chains: Map<string, NbcInternalNegotiationChain>;
} {
  const chains = new Map(initial.map((chain) => [chain.id, { ...chain }]));
  return {
    chains,
    host: {
      getChain(chainId) {
        return chains.get(chainId) ?? null;
      },
      onTurnCommitted({ chainId, sessionId, turnsCompleted }) {
        const chain = chains.get(chainId);
        if (chain === undefined) return;
        chains.set(chainId, { ...chain, sessionId, turnsCompleted });
      },
      onLeft({ chainId, detail }) {
        const chain = chains.get(chainId);
        if (chain === undefined) return;
        chains.set(chainId, {
          ...chain,
          status: "closed",
          ...(detail !== undefined ? { constraints: detail } : {}),
        });
      },
    },
  };
}

describe("nbc internal negotiation routes", () => {
  test("rejects missing Bearer", async () => {
    const { host } = createMemoryHost([]);
    const routes = registerNbcInternalNegotiationRoutes({
      requireAuth,
      host,
      sessions: { dataDirForDid: () => null } as never,
      notifyChainChanged: () => undefined,
    });
    const res = await routes["/api/internal/negotiations/:chainId"].GET(
      req("http://localhost/api/internal/negotiations/c1?asDid=did%3Akey%3Aalice"),
    );
    expect(res.status).toBe(401);
  });

  test("initiator GET includes brief; counterparty GET does not", async () => {
    const { host } = createMemoryHost([
      {
        id: "c1",
        sessionId: "sess-1",
        status: "open",
        channelId: "ch-1",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        turnsCompleted: 0,
        maxTurns: 6,
        objective: "secret objective",
        constraints: "secret constraints",
      },
    ]);
    const routes = registerNbcInternalNegotiationRoutes({
      requireAuth,
      host,
      sessions: { dataDirForDid: () => "/tmp/replica" } as never,
      notifyChainChanged: () => undefined,
      loadGraph: async (_input) => emptyGraph(),
    });

    const initiator = await routes["/api/internal/negotiations/:chainId"].GET(
      req("http://localhost/api/internal/negotiations/c1?asDid=did%3Akey%3Aalice", MESH_TOKEN),
    );
    expect(initiator.status).toBe(200);
    const initBody = (await initiator.json()) as {
      chain: { objective: string | null; constraints: string | null };
      brief?: { objective?: string; constraints?: string };
    };
    expect(initBody.chain.objective).toBe("secret objective");
    expect(initBody.brief?.objective).toBe("secret objective");

    const counterparty = await routes["/api/internal/negotiations/:chainId"].GET(
      req("http://localhost/api/internal/negotiations/c1?asDid=did%3Akey%3Abob", MESH_TOKEN),
    );
    expect(counterparty.status).toBe(200);
    const peerBody = (await counterparty.json()) as {
      chain: { objective: string | null; constraints: string | null };
      brief?: unknown;
    };
    expect(peerBody.chain.objective).toBeNull();
    expect(peerBody.brief).toBeUndefined();
  });

  test("POST turn publishes chain.changed and rejects impersonation", async () => {
    const { host, chains } = createMemoryHost([
      {
        id: "c1",
        sessionId: "sess-1",
        status: "open",
        channelId: "ch-1",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        turnsCompleted: 0,
        maxTurns: 6,
      },
    ]);
    const published: Array<{ cause: string; turnSeq: number }> = [];
    const routes = registerNbcInternalNegotiationRoutes({
      requireAuth,
      host,
      sessions: {
        commitTurn: async () => ({ sessionId: "sess-1", genesis: false }),
      } as never,
      notifyChainChanged: (event) => {
        published.push({ cause: event.cause, turnSeq: event.turnSeq });
      },
    });

    const bad = await routes["/api/internal/negotiations/:chainId/turns"].POST(
      req("http://localhost/api/internal/negotiations/c1/turns", MESH_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asDid: "did:key:eve",
          turn: { type: "offer" },
        }),
      }),
    );
    expect(bad.status).toBe(400);

    const ok = await routes["/api/internal/negotiations/:chainId/turns"].POST(
      req("http://localhost/api/internal/negotiations/c1/turns", MESH_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asDid: "did:key:alice",
          turn: { type: "offer" },
        }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(published.some((e) => e.cause === "turn")).toBe(true);
    expect(chains.get("c1")?.turnsCompleted).toBe(1);
  });

  test("commitTurn genesis vs sendTurn and non-initiator genesis 409", async () => {
    const { host, chains } = createMemoryHost([
      {
        id: "c-genesis",
        sessionId: "",
        status: "open",
        channelId: "ch-1",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        turnsCompleted: 0,
        maxTurns: 6,
      },
    ]);
    const commitCalls: Array<{ chainId: string; asDid: string; body: unknown }> = [];
    const routes = registerNbcInternalNegotiationRoutes({
      requireAuth,
      host,
      sessions: {
        commitTurn: async (
          chainId: string,
          input: { asDid: string; body: Record<string, unknown> },
        ) => {
          commitCalls.push({ chainId, asDid: input.asDid, body: input.body });
          const chain = chains.get(chainId);
          if (chain === undefined) {
            throw new Error(`commitTurn: no live session for ${chainId}`);
          }
          if (chain.sessionId.length === 0 && input.asDid !== chain.initiatorDid) {
            throw new Error(NBC_GENESIS_NOT_INITIATOR);
          }
          const genesis = chain.sessionId.length === 0;
          return {
            sessionId: genesis ? "sess-genesis" : chain.sessionId,
            genesis,
          };
        },
        handleForDid: () => ({
          chainRelease: async () => undefined,
        }),
      } as never,
      notifyChainChanged: () => undefined,
      loadGraph: async (_input) => emptyGraph(),
    });

    const genesis = {
      offer: { type: "service.slot" },
      ports: [{ type: "slot" }],
    };
    const first = await routes["/api/internal/negotiations/:chainId/turns"].POST(
      Object.assign(
        new Request("http://localhost/api/internal/negotiations/c-genesis/turns", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MESH_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ asDid: "did:key:alice", turn: genesis }),
        }),
        { params: { chainId: "c-genesis" } },
      ),
    );
    expect(first.status).toBe(200);
    expect(commitCalls).toEqual([{ chainId: "c-genesis", asDid: "did:key:alice", body: genesis }]);
    expect(chains.get("c-genesis")?.sessionId).toBe("sess-genesis");

    chains.set("c-peer", {
      id: "c-peer",
      sessionId: "",
      status: "open",
      channelId: "ch-2",
      initiatorDid: "did:key:alice",
      counterpartyDid: "did:key:bob",
      turnsCompleted: 0,
      maxTurns: 6,
    });
    const peerRes = await routes["/api/internal/negotiations/:chainId/turns"].POST(
      Object.assign(
        new Request("http://localhost/api/internal/negotiations/c-peer/turns", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MESH_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asDid: "did:key:bob",
            turn: { offer: {}, ports: [] },
          }),
        }),
        { params: { chainId: "c-peer" } },
      ),
    );
    expect(peerRes.status).toBe(409);
    expect(chains.get("c-peer")?.sessionId).toBe("");
  });

  test("POST leave commits disconnect and closes the chain", async () => {
    const { host, chains } = createMemoryHost([
      {
        id: "c1",
        sessionId: "sess-1",
        status: "open",
        channelId: "ch-1",
        initiatorDid: "did:key:alice",
        counterpartyDid: "did:key:bob",
        turnsCompleted: 1,
        maxTurns: 6,
      },
    ]);
    const commitCalls: Array<{ asDid: string; body: unknown }> = [];
    const routes = registerNbcInternalNegotiationRoutes({
      requireAuth,
      host,
      sessions: {
        commitTurn: async (
          _chainId: string,
          input: { asDid: string; body: Record<string, unknown> },
        ) => {
          commitCalls.push({ asDid: input.asDid, body: input.body });
          return { sessionId: "sess-1", genesis: false };
        },
      } as never,
      notifyChainChanged: () => undefined,
    });

    const res = await routes["/api/internal/negotiations/:chainId/leave"].POST(
      req("http://localhost/api/internal/negotiations/c1/leave", MESH_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asDid: "did:key:alice", reason: "done" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(commitCalls).toEqual([{ asDid: "did:key:alice", body: { disconnect: true } }]);
    expect(chains.get("c1")?.status).toBe("closed");
    expect(chains.get("c1")?.constraints).toBe("done");
  });
});
