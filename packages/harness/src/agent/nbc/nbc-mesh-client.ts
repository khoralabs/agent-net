import type { NbcChainGraph } from "@khoralabs/obp-nbc";

export type NbcNegotiationStateResponse = {
  chain: {
    id: string;
    initiatorDid: string;
    counterpartyDid: string;
    status: string;
    maxTurns: number;
    turnsCompleted: number;
    objective?: string | null;
    constraints?: string | null;
  };
  graph: NbcChainGraph;
  brief?: { objective?: string; constraints?: string };
};

export type NbcMeshClient = {
  fetchState(chainId: string, asDid: string): Promise<NbcNegotiationStateResponse>;
  postTurn(chainId: string, asDid: string, turn: Record<string, unknown>): Promise<void>;
  postLeave(chainId: string, asDid: string, reason?: string): Promise<void>;
};

export function createNbcMeshClient(input: { baseUrl: string; token: string }): NbcMeshClient {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const token = input.token.trim();

  async function authFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  return {
    async fetchState(chainId, asDid) {
      const res = await authFetch(
        `/api/internal/negotiations/${encodeURIComponent(chainId)}?asDid=${encodeURIComponent(asDid)}`,
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`fetch negotiation state failed: ${res.status} ${text.slice(0, 200)}`);
      }
      return (await res.json()) as NbcNegotiationStateResponse;
    },

    async postTurn(chainId, asDid, turn) {
      const res = await authFetch(
        `/api/internal/negotiations/${encodeURIComponent(chainId)}/turns`,
        {
          method: "POST",
          body: JSON.stringify({ asDid, turn }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`post negotiation turn failed: ${res.status} ${text.slice(0, 200)}`);
      }
    },

    async postLeave(chainId, asDid, reason) {
      const res = await authFetch(
        `/api/internal/negotiations/${encodeURIComponent(chainId)}/leave`,
        {
          method: "POST",
          body: JSON.stringify({ asDid, reason }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`post negotiation leave failed: ${res.status} ${text.slice(0, 200)}`);
      }
    },
  };
}
