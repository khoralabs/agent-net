import { hkdfSync } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  decryptWithWrapKey,
  encryptWithWrapKey,
  identityPrivFromPersistableSigner,
  type PersistableSigner,
  writeFileAtomic600,
} from "@khoralabs/did-key-identity";

const INVITE_BANK_INFO = "harness-invite-bank-v1";
const INVITE_BANK_KEY_BYTES = 32;

type InviteBankFileV1 = {
  v: 1;
  did: string;
  alg: "aes-256-gcm";
  /** Base64 of iv || tag || ciphertext over UTF-8 JSON string[]. */
  ciphertext: string;
};

function deriveInviteBankKey(signer: PersistableSigner): Uint8Array {
  const seed = identityPrivFromPersistableSigner(signer);
  const key = hkdfSync(
    "sha256",
    seed,
    new Uint8Array(0),
    Buffer.from(INVITE_BANK_INFO),
    INVITE_BANK_KEY_BYTES,
  );
  return new Uint8Array(key);
}

function encodeTokens(tokens: string[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(tokens));
}

function decodeTokens(bytes: Uint8Array): string[] {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(parsed)) {
    throw new Error("invite bank payload is not a string array");
  }
  return parsed
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function safeDidFileName(did: string): string {
  return did.replace(/:/g, "_");
}

/**
 * Per-agent bank of Khora invite tokens issued at registration.
 * Plaintext is never written to disk — AES-256-GCM with a key derived via
 * HKDF-SHA256 from the agent's Ed25519 seed (`harness-invite-bank-v1`).
 *
 * Spawn/register does not consume from this bank; {@link list} is for future
 * sovereign viral invite flows.
 */
export class PerAgentInviteBank {
  readonly #dataDir: string;

  constructor(dataDir: string) {
    this.#dataDir = dataDir;
  }

  filePath(did: string): string {
    return path.join(this.#dataDir, "agents", `${safeDidFileName(did)}.invites.json`);
  }

  /** Append tokens for this agent (decrypt → merge → re-encrypt). */
  async deposit(signer: PersistableSigner, tokens: readonly string[]): Promise<void> {
    const incoming = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
    if (incoming.length === 0) return;

    const existing = await this.list(signer);
    const merged = [...existing, ...incoming];
    await this.#write(signer, merged);
  }

  /** Decrypt and return plaintext invites for this agent (empty if none). */
  async list(signer: PersistableSigner): Promise<string[]> {
    const filePath = this.filePath(signer.did);
    const file = Bun.file(filePath);
    if (!(await file.exists())) return [];

    const parsed = (await file.json()) as InviteBankFileV1;
    if (parsed.v !== 1 || parsed.alg !== "aes-256-gcm" || typeof parsed.ciphertext !== "string") {
      throw new Error(`invite bank file ${filePath} has unrecognized format`);
    }
    if (parsed.did !== signer.did) {
      throw new Error(
        `invite bank file ${filePath}: did=${parsed.did} but signer did=${signer.did}`,
      );
    }

    const key = deriveInviteBankKey(signer);
    const plaintext = decryptWithWrapKey(Buffer.from(parsed.ciphertext, "base64"), key);
    return decodeTokens(plaintext);
  }

  async clear(did: string): Promise<void> {
    await rm(this.filePath(did), { force: true });
  }

  async #write(signer: PersistableSigner, tokens: string[]): Promise<void> {
    const key = deriveInviteBankKey(signer);
    const blob = encryptWithWrapKey(encodeTokens(tokens), key);
    const payload: InviteBankFileV1 = {
      v: 1,
      did: signer.did,
      alg: "aes-256-gcm",
      ciphertext: Buffer.from(blob).toString("base64"),
    };
    const filePath = this.filePath(signer.did);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFileAtomic600(filePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
}
