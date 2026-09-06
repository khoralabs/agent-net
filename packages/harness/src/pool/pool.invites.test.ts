import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PerAgentInviteBank } from "./per-agent-invite-bank.ts";
import { ManagedAgentPool } from "./pool.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ManagedAgentPool registration invites", () => {
  test("spawns from admin faucet, then withdraws a parent agent token", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "pool-invites-"));
    const inviteTokens: (string | undefined)[] = [];
    try {
      globalThis.fetch = mock(async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const body = (await request.clone().json()) as {
          inviteToken?: string;
          metadata: { username: string };
        };
        inviteTokens.push(body.inviteToken);
        return Response.json({
          did: "did:key:registered",
          profileId: crypto.randomUUID(),
          profile: { id: crypto.randomUUID(), username: body.metadata.username },
          inviteTokens: ["child-token"],
        });
      }) as unknown as typeof fetch;

      const mintInvite = mock(async () => "admin-token");
      const bank = new PerAgentInviteBank(dataDir);
      const pool = await ManagedAgentPool.create({
        dataDir,
        baseUrl: "http://khora.test",
        inviteBank: bank,
        mintInvite,
        invitesRequired: true,
      });

      const parentDid = await pool.spawn();
      await pool.spawn(undefined, { inviteFromDid: parentDid });
      await expect(pool.spawn(undefined, { inviteFromDid: parentDid })).rejects.toThrow(
        /no available invite tokens/,
      );

      expect(inviteTokens).toEqual(["admin-token", "child-token"]);
      expect(mintInvite).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  test("fails clearly when an invite is required but unavailable", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "pool-invites-required-"));
    try {
      const pool = await ManagedAgentPool.create({
        dataDir,
        baseUrl: "http://khora.test",
        invitesRequired: true,
      });
      await expect(pool.spawn()).rejects.toThrow(/requires an invite/);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
