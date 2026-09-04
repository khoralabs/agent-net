import { describe, expect, test } from "bun:test";

import {
  mintKhoraInviteTokens,
  resolveKhoraAdminTokenFromEnv,
  resolveKhoraMintInvite,
} from "./mint-invite.ts";

type StubRequest = { path: string; auth: string | null; body: unknown };

/** Serve one canned mint response and record what the client sent. */
function startMintStub(respond: (req: StubRequest) => Response): {
  baseUrl: string;
  requests: StubRequest[];
  stop: () => void;
} {
  const requests: StubRequest[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const body = await req.json().catch(() => undefined);
      const entry: StubRequest = {
        path: url.pathname,
        auth: req.headers.get("Authorization"),
        body,
      };
      requests.push(entry);
      return respond(entry);
    },
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    requests,
    stop: () => server.stop(true),
  };
}

describe("resolveKhoraAdminTokenFromEnv", () => {
  test("prefers KHORA_ADMIN_TOKEN over the fallbacks", () => {
    expect(
      resolveKhoraAdminTokenFromEnv({
        KHORA_ADMIN_TOKEN: "primary",
        ADMIN_ROOT_TOKEN: "secondary",
        KHORA_CONSOLE_ROOT_TOKEN: "tertiary",
      }),
    ).toBe("primary");
  });

  test("falls back in declared order and trims", () => {
    expect(resolveKhoraAdminTokenFromEnv({ ADMIN_ROOT_TOKEN: " secondary " })).toBe("secondary");
    expect(resolveKhoraAdminTokenFromEnv({ KHORA_CONSOLE_ROOT_TOKEN: "tertiary" })).toBe(
      "tertiary",
    );
  });

  test("ignores blank values and returns undefined when unset", () => {
    expect(resolveKhoraAdminTokenFromEnv({ KHORA_ADMIN_TOKEN: "   " })).toBeUndefined();
    expect(resolveKhoraAdminTokenFromEnv({})).toBeUndefined();
  });
});

describe("mintKhoraInviteTokens", () => {
  test("posts to the operator mint route with a Bearer token", async () => {
    const stub = startMintStub(() => Response.json({ tokens: ["inv-1", "inv-2"] }));
    try {
      const tokens = await mintKhoraInviteTokens({
        baseUrl: `${stub.baseUrl}/`,
        adminToken: "root-token",
        count: 2,
      });
      expect(tokens).toEqual(["inv-1", "inv-2"]);
      expect(stub.requests).toEqual([
        {
          path: "/v1/ops/invites/mint",
          auth: "Bearer root-token",
          body: { count: 2 },
        },
      ]);
    } finally {
      stub.stop();
    }
  });

  test("defaults count to 1 and drops blank tokens", async () => {
    const stub = startMintStub(() => Response.json({ tokens: [" inv-1 ", "", 7] }));
    try {
      const tokens = await mintKhoraInviteTokens({
        baseUrl: stub.baseUrl,
        adminToken: "root-token",
      });
      expect(tokens).toEqual(["inv-1"]);
      expect(stub.requests[0]?.body).toEqual({ count: 1 });
    } finally {
      stub.stop();
    }
  });

  test("requires baseUrl and adminToken", async () => {
    await expect(mintKhoraInviteTokens({ baseUrl: "  ", adminToken: "t" })).rejects.toThrow(
      /baseUrl is required/,
    );
    await expect(
      mintKhoraInviteTokens({ baseUrl: "http://127.0.0.1:1", adminToken: " " }),
    ).rejects.toThrow(/adminToken is required/);
  });

  test("surfaces non-2xx responses", async () => {
    const stub = startMintStub(() => new Response("nope", { status: 401 }));
    try {
      await expect(
        mintKhoraInviteTokens({ baseUrl: stub.baseUrl, adminToken: "bad" }),
      ).rejects.toThrow(/401/);
    } finally {
      stub.stop();
    }
  });

  test("rejects non-JSON and malformed payloads", async () => {
    const notJson = startMintStub(() => new Response("plain text"));
    try {
      await expect(
        mintKhoraInviteTokens({ baseUrl: notJson.baseUrl, adminToken: "t" }),
      ).rejects.toThrow(/not JSON/);
    } finally {
      notJson.stop();
    }

    const noTokens = startMintStub(() => Response.json({ ok: true }));
    try {
      await expect(
        mintKhoraInviteTokens({ baseUrl: noTokens.baseUrl, adminToken: "t" }),
      ).rejects.toThrow(/missing tokens\[\]/);
    } finally {
      noTokens.stop();
    }

    const emptyTokens = startMintStub(() => Response.json({ tokens: [] }));
    try {
      await expect(
        mintKhoraInviteTokens({ baseUrl: emptyTokens.baseUrl, adminToken: "t" }),
      ).rejects.toThrow(/no tokens/);
    } finally {
      emptyTokens.stop();
    }
  });
});

describe("resolveKhoraMintInvite", () => {
  test("returns undefined when no operator token is configured", () => {
    expect(resolveKhoraMintInvite({ khoraBaseUrl: "http://127.0.0.1:1", env: {} })).toBeUndefined();
  });

  test("mints a single token per call", async () => {
    const stub = startMintStub(() => Response.json({ tokens: ["inv-1"] }));
    try {
      const mintInvite = resolveKhoraMintInvite({
        khoraBaseUrl: stub.baseUrl,
        env: { ADMIN_ROOT_TOKEN: "root-token" },
      });
      expect(mintInvite).toBeDefined();
      expect(await mintInvite?.()).toBe("inv-1");
      expect(stub.requests[0]).toEqual({
        path: "/v1/ops/invites/mint",
        auth: "Bearer root-token",
        body: { count: 1 },
      });
    } finally {
      stub.stop();
    }
  });

  test("prefers an explicit token over the environment", async () => {
    const stub = startMintStub(() => Response.json({ tokens: ["inv-1"] }));
    try {
      const mintInvite = resolveKhoraMintInvite({
        khoraBaseUrl: stub.baseUrl,
        adminToken: "explicit-token",
        env: { KHORA_ADMIN_TOKEN: "env-token" },
      });
      await mintInvite?.();
      expect(stub.requests[0]?.auth).toBe("Bearer explicit-token");
    } finally {
      stub.stop();
    }
  });
});
