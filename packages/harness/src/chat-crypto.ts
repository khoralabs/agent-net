import type { ChatSigner, ChatVerifier, ScopeRef, SignedEnvelope } from "@khoralabs/chat";
import type { RelaySigner } from "@khoralabs/relay/crypto";
import { ed25519PublicKeyBytesFromDid } from "@khoralabs/relay/crypto";
import { verifyAsync } from "@noble/ed25519";

export const HARNESS_CHAT_SIGNATURE_ALGORITHM = "ed25519";

export type ResolveHarnessChatSigner = (did: string) => Promise<RelaySigner | undefined>;

function signatureBytesToB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function signatureBytesFromB64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

/** Adapt harness DID keys (`RelaySigner`) to chat-core `ChatSigner` / `ChatVerifier`. */
export function createHarnessChatCrypto(resolveSigner: ResolveHarnessChatSigner): {
  signer: ChatSigner;
  verifier: ChatVerifier;
} {
  return {
    signer: {
      async sign(payload: Uint8Array, author: ScopeRef): Promise<SignedEnvelope> {
        const relay = await resolveSigner(author.id);
        if (relay === undefined) {
          throw new Error(`no signing key for ${author.type} ${author.id}`);
        }
        if (relay.did !== author.id) {
          throw new Error("resolved signer did does not match author id");
        }
        const signature = await relay.sign(payload);
        return {
          algorithm: HARNESS_CHAT_SIGNATURE_ALGORITHM,
          signer: author,
          signature: signatureBytesToB64Url(signature),
          signedAtMs: Date.now(),
        };
      },
    },
    verifier: {
      async verify(payload: Uint8Array, envelope: SignedEnvelope): Promise<boolean> {
        if (envelope.algorithm !== HARNESS_CHAT_SIGNATURE_ALGORITHM) return false;
        try {
          const pubKey = ed25519PublicKeyBytesFromDid(envelope.signer.id);
          return verifyAsync(signatureBytesFromB64Url(envelope.signature), payload, pubKey);
        } catch {
          return false;
        }
      },
    },
  };
}
