import { createHash } from "node:crypto";
import type { NetworkAttribution, ThreadHashSnapshot } from "../network/types.ts";

/** Capability hashes used for network attribution (no agent/turn import). */
export type AttributionCapabilities = {
  staticHash: string;
  runtimeHash: string;
  invocationHash?: string;
  toolRefs: Array<{ toolKey: string; toolHash: string }>;
};

export type AttributionInput = {
  staticHash: string;
  runtimeHash: string;
  invocationHash?: string;
  toolRefs: Array<{ toolKey: string; toolHash: string }>;
  memoriesProvenanceRootHex: string;
  threadHashes: ThreadHashSnapshot[];
};

function canonicalAttributionPayload(input: AttributionInput): Record<string, unknown> {
  return {
    staticHash: input.staticHash,
    runtimeHash: input.runtimeHash,
    invocationHash: input.invocationHash ?? null,
    toolRefs: [...input.toolRefs].sort((a, b) => a.toolKey.localeCompare(b.toolKey)),
    memoriesProvenanceRootHex: input.memoriesProvenanceRootHex,
    threadHashes: [...input.threadHashes].sort((a, b) => a.threadId.localeCompare(b.threadId)),
  };
}

export function computeAttributionDigest(input: AttributionInput): string {
  const canonical = JSON.stringify(canonicalAttributionPayload(input));
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildNetworkAttribution(input: {
  capabilities: AttributionCapabilities;
  memoriesProvenanceRootHex: string;
  threadHashes: ThreadHashSnapshot[];
}): NetworkAttribution {
  const base: AttributionInput = {
    staticHash: input.capabilities.staticHash,
    runtimeHash: input.capabilities.runtimeHash,
    invocationHash: input.capabilities.invocationHash,
    toolRefs: input.capabilities.toolRefs,
    memoriesProvenanceRootHex: input.memoriesProvenanceRootHex,
    threadHashes: input.threadHashes,
  };
  return {
    ...base,
    attributionDigestHex: computeAttributionDigest(base),
  };
}
