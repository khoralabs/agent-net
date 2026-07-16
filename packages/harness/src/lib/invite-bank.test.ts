import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateIdentity } from "@khoralabs/did-key-identity";

import { parseIdentityWrapKey, wrapKeySecretFromBytes } from "./identity-wrap-key.ts";
import { PerAgentInviteBank } from "./per-agent-invite-bank.ts";

describe("parseIdentityWrapKey", () => {
  test("accepts 64-char hex", () => {
    const hex = "00".repeat(32);
    const key = parseIdentityWrapKey(hex);
    expect(key.byteLength).toBe(32);
    expect(wrapKeySecretFromBytes(key).type).toBe("wrapKey");
  });

  test("accepts base64", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = parseIdentityWrapKey(Buffer.from(bytes).toString("base64"));
    expect([...key]).toEqual([...bytes]);
  });

  test("rejects wrong length", () => {
    expect(() => parseIdentityWrapKey("dG9vLXNob3J0")).toThrow(/32 bytes/);
  });
});

describe("PerAgentInviteBank", () => {
  test("deposit and list round-trip without storing plaintext", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "invite-bank-"));
    try {
      const bank = new PerAgentInviteBank(dataDir);
      const signer = await generateIdentity();
      await bank.deposit(signer, ["token-a", "token-b"]);
      await bank.deposit(signer, ["token-c"]);

      expect(await bank.list(signer)).toEqual(["token-a", "token-b", "token-c"]);

      const raw = await Bun.file(bank.filePath(signer.did)).text();
      expect(raw).not.toContain("token-a");
      expect(raw).toContain("ciphertext");

      await bank.clear(signer.did);
      expect(await bank.list(signer)).toEqual([]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
