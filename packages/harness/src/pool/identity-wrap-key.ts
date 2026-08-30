import { readFile } from "node:fs/promises";
import {
  type IdentitySecret,
  isPlainIdentityFile,
  loadIdentity,
  type PersistableSigner,
  saveIdentity,
  WRAP_KEY_BYTES,
} from "@khoralabs/did-key-identity";

/** Env var for the 32-byte AES wrap key (base64 or hex). */
export const HARNESS_IDENTITY_WRAP_KEY_ENV = "HARNESS_IDENTITY_WRAP_KEY";

/**
 * Parse a 32-byte wrap key from base64 or hex.
 * Accepts standard/url-safe base64 and 64-char hex.
 */
export function parseIdentityWrapKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("identity wrap key must not be empty");
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === WRAP_KEY_BYTES * 2) {
    const key = Buffer.from(trimmed, "hex");
    if (key.byteLength !== WRAP_KEY_BYTES) {
      throw new Error(`identity wrap key hex must decode to ${WRAP_KEY_BYTES} bytes`);
    }
    return new Uint8Array(key);
  }

  const key = Buffer.from(trimmed, "base64");
  if (key.byteLength !== WRAP_KEY_BYTES) {
    throw new Error(
      `identity wrap key must be ${WRAP_KEY_BYTES} bytes (got ${key.byteLength}; use base64 or 64-char hex)`,
    );
  }
  return new Uint8Array(key);
}

export function wrapKeySecretFromBytes(key: Uint8Array): IdentitySecret {
  if (key.byteLength !== WRAP_KEY_BYTES) {
    throw new Error(`identity wrap key must be ${WRAP_KEY_BYTES} bytes (got ${key.byteLength})`);
  }
  return { type: "wrapKey", key };
}

export function resolveIdentitySecretFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): IdentitySecret | undefined {
  const raw = env[HARNESS_IDENTITY_WRAP_KEY_ENV]?.trim();
  if (raw === undefined || raw.length === 0) return undefined;
  return wrapKeySecretFromBytes(parseIdentityWrapKey(raw));
}

export function requireIdentitySecret(
  explicit: IdentitySecret | undefined,
  env: NodeJS.ProcessEnv = process.env,
): IdentitySecret {
  if (explicit !== undefined) return explicit;
  const fromEnv = resolveIdentitySecretFromEnv(env);
  if (fromEnv !== undefined) return fromEnv;
  throw new Error(
    `Identity wrap key is required (pass identitySecret or set ${HARNESS_IDENTITY_WRAP_KEY_ENV} to a 32-byte base64/hex key)`,
  );
}

/**
 * Load a harness agent identity. When `secret` is set, plaintext files are
 * upgraded to sealed storage on first successful load.
 */
export async function loadHarnessIdentity(
  filePath: string,
  secret?: IdentitySecret,
): Promise<PersistableSigner | undefined> {
  const signer = await loadIdentity(filePath, secret !== undefined ? { secret } : {});
  if (signer === undefined) return undefined;

  if (secret !== undefined) {
    try {
      const text = await readFile(filePath, "utf8");
      const parsed: unknown = JSON.parse(text);
      if (isPlainIdentityFile(parsed)) {
        await saveIdentity(filePath, signer, { secret });
      }
    } catch {
      /* missing/unreadable — loadIdentity already succeeded; skip upgrade */
    }
  }

  return signer;
}

export async function saveHarnessIdentity(
  filePath: string,
  signer: PersistableSigner,
  secret?: IdentitySecret,
): Promise<void> {
  await saveIdentity(filePath, signer, secret !== undefined ? { secret } : {});
}
