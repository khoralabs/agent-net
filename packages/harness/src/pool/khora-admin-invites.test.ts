import { describe, expect, test } from "bun:test";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-client";
import { mintKhoraInviteTokens } from "./khora-admin-invites.ts";

describe("mintKhoraInviteTokens", () => {
  test("POSTs to KHORA_HTTP_PATH.opsInvitesMint", async () => {
    let seenUrl = "";
    const tokens = await mintKhoraInviteTokens({
      baseUrl: "http://khora.test",
      adminToken: "secret",
      count: 2,
      fetchFn: async (input, init) => {
        seenUrl = String(input);
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        });
        expect(init?.body).toBe(JSON.stringify({ count: 2 }));
        return new Response(JSON.stringify({ tokens: ["a", "b"] }), { status: 200 });
      },
    });
    expect(seenUrl).toBe(`http://khora.test${KHORA_HTTP_PATH.opsInvitesMint}`);
    expect(KHORA_HTTP_PATH.opsInvitesMint).toBe("/v1/ops/invites/mint");
    expect(tokens).toEqual(["a", "b"]);
  });
});
