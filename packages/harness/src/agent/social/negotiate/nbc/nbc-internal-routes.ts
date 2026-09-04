import type { NbcChainGraph } from "@khoralabs/obp-nbc";
import { boundaryClientErrorFields } from "../../../../lib/boundary-client-error.ts";
import { NBC_GENESIS_NOT_INITIATOR, type VellumChainSessionRegistry } from "../vellum-sessions.ts";
import type { NbcLoopChain } from "./loop-host.ts";
import type { NbcChainChanged } from "./nbc-chain-change-bus.ts";

export type NbcInternalNegotiationChain = NbcLoopChain & {
  id: string;
  sessionId: string;
};

export type NbcInternalNegotiationHost = {
  getChain(chainId: string): NbcInternalNegotiationChain | null;
  onTurnCommitted(input: {
    chainId: string;
    sessionId: string;
    turnsCompleted: number;
    turnLimitReached: boolean;
  }): void;
  onLeft(input: { chainId: string; detail?: string }): void;
};

export type RegisterNbcInternalNegotiationRoutesInput = {
  requireAuth: (req: Request) => Response | null;
  host: NbcInternalNegotiationHost;
  sessions: VellumChainSessionRegistry;
  notifyChainChanged: (event: NbcChainChanged) => void;
  loadGraph?: () => Promise<NbcChainGraph>;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function sanitizeReason(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().slice(0, 500);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function registerNbcInternalNegotiationRoutes(
  input: RegisterNbcInternalNegotiationRoutesInput,
) {
  const { requireAuth, host, sessions, notifyChainChanged } = input;

  return {
    "/api/internal/negotiations/:chainId": {
      async GET(req: Request & { params: { chainId: string } }) {
        const authError = requireAuth(req);
        if (authError !== null) return authError;
        const chainId = decodeURIComponent(req.params.chainId);
        const asDid = new URL(req.url).searchParams.get("asDid")?.trim() ?? "";
        const chain = host.getChain(chainId);
        if (chain === null) return json({ error: "Chain not found" }, 404);
        if (asDid !== chain.initiatorDid && asDid !== chain.counterpartyDid) {
          return json({ error: "asDid must be a party on this chain" }, 400);
        }
        if (chain.channelId.length === 0) {
          return json({ error: "Chain has no channel yet" }, 409);
        }
        if (chain.sessionId.length === 0) {
          return json({ error: "Chain has no Vellum session yet" }, 409);
        }
        try {
          const graph =
            input.loadGraph !== undefined
              ? await input.loadGraph()
              : (
                  await sessions
                    .handleForDid(chainId, chain.initiatorDid, chain.counterpartyDid, asDid)
                    ?.getSessionSnapshot(chain.sessionId)
                )?.graph;
          if (graph === undefined) {
            return json({ error: "Vellum attachment is not bound for asDid" }, 409);
          }
          const brief =
            asDid === chain.initiatorDid
              ? {
                  ...(chain.objective !== undefined ? { objective: chain.objective } : {}),
                  ...(chain.constraints !== undefined ? { constraints: chain.constraints } : {}),
                }
              : undefined;
          return json({
            chain: {
              id: chain.id,
              initiatorDid: chain.initiatorDid,
              counterpartyDid: chain.counterpartyDid,
              status: chain.status,
              maxTurns: chain.maxTurns,
              turnsCompleted: chain.turnsCompleted,
              objective: asDid === chain.initiatorDid ? (chain.objective ?? null) : null,
              constraints: asDid === chain.initiatorDid ? (chain.constraints ?? null) : null,
            },
            graph,
            ...(brief !== undefined && Object.keys(brief).length > 0 ? { brief } : {}),
          });
        } catch (err) {
          const fields = boundaryClientErrorFields(err);
          return json(
            {
              error: fields.message,
              ...(fields.code !== undefined ? { code: fields.code } : {}),
            },
            fields.status !== undefined && fields.status >= 400 ? fields.status : 502,
          );
        }
      },
    },

    "/api/internal/negotiations/:chainId/turns": {
      async POST(req: Request & { params: { chainId: string } }) {
        const authError = requireAuth(req);
        if (authError !== null) return authError;
        const chainId = decodeURIComponent(req.params.chainId);
        const chain = host.getChain(chainId);
        if (chain === null) return json({ error: "Chain not found" }, 404);
        if (chain.status !== "open") {
          return json({ error: `Chain is ${chain.status}` }, 409);
        }
        let body: { asDid?: unknown; turn?: unknown } = {};
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const asDid = typeof body.asDid === "string" ? body.asDid.trim() : "";
        if (asDid !== chain.initiatorDid && asDid !== chain.counterpartyDid) {
          return json({ error: "asDid must be a party on this chain" }, 400);
        }
        if (body.turn === null || typeof body.turn !== "object") {
          return json({ error: "turn object is required" }, 400);
        }
        const turn = body.turn as Record<string, unknown>;
        try {
          const committed = await sessions.commitTurn(chainId, {
            asDid,
            body: turn,
          });
          const turnsCompleted = chain.turnsCompleted + 1;
          const turnLimitReached = turnsCompleted >= chain.maxTurns;
          host.onTurnCommitted({
            chainId,
            sessionId: committed.sessionId,
            turnsCompleted,
            turnLimitReached,
          });
          notifyChainChanged({
            chainId,
            turnSeq: turnsCompleted,
            cause: "turn",
          });
          return json({ ok: true, turnsCompleted });
        } catch (err) {
          const fields = boundaryClientErrorFields(err);
          if (fields.message === NBC_GENESIS_NOT_INITIATOR) {
            return json(
              {
                error: fields.message,
                ...(fields.code !== undefined ? { code: fields.code } : {}),
              },
              409,
            );
          }
          if (fields.message.includes("no Vellum handle")) {
            return json({ error: "No Vellum handle for asDid" }, 409);
          }
          return json(
            {
              error: fields.message,
              ...(fields.code !== undefined ? { code: fields.code } : {}),
            },
            fields.status !== undefined && fields.status >= 400 ? fields.status : 502,
          );
        }
      },
    },

    "/api/internal/negotiations/:chainId/leave": {
      async POST(req: Request & { params: { chainId: string } }) {
        const authError = requireAuth(req);
        if (authError !== null) return authError;
        const chainId = decodeURIComponent(req.params.chainId);
        const chain = host.getChain(chainId);
        if (chain === null) return json({ error: "Chain not found" }, 404);
        let body: { asDid?: unknown; reason?: unknown } = {};
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const asDid = typeof body.asDid === "string" ? body.asDid.trim() : "";
        if (asDid !== chain.initiatorDid && asDid !== chain.counterpartyDid) {
          return json({ error: "asDid must be a party on this chain" }, 400);
        }
        const reason = sanitizeReason(body.reason);
        try {
          await sessions.commitTurn(chainId, {
            asDid,
            body: { disconnect: true },
          });
        } catch (err) {
          const fields = boundaryClientErrorFields(err);
          if (fields.message.includes("no Vellum handle")) {
            return json({ error: "No Vellum handle for asDid" }, 409);
          }
          return json(
            {
              error: fields.message,
              ...(fields.code !== undefined ? { code: fields.code } : {}),
            },
            fields.status !== undefined && fields.status >= 400 ? fields.status : 502,
          );
        }
        host.onLeft({
          chainId,
          ...(reason !== undefined ? { detail: reason } : {}),
        });
        notifyChainChanged({
          chainId,
          turnSeq: chain.turnsCompleted,
          cause: "turn",
        });
        return json({ ok: true, left: true });
      },
    },
  };
}
