import type { PersistableSigner } from "@khoralabs/did-key-identity";
import type { KhoraClient } from "@khoralabs/khora-client";

/**
 * Minimal identity for one network actor.
 * Capability modules (social, memories, negotiate) depend on this — not on {@link AgentHandle}.
 */
export type AgentActor = {
  readonly did: string;
  readonly signer: PersistableSigner;
  readonly client: KhoraClient;
  readonly externalId?: string;
};
