import path from "node:path";

import type { IdentitySecret } from "@khoralabs/did-key-identity";
import { KhoraClient } from "@khoralabs/khora-client";
import { AgentStore } from "../../../../agents";
import {
  loadHarnessIdentity,
  resolveIdentitySecretFromEnv,
} from "../../../../lib/identity-wrap-key.ts";

export function resolveKhoraServerBaseUrl(): string | undefined {
  const value =
    process.env.KHORA_SERVER_URL?.trim() ||
    process.env.HARNESS_KHORA_BASE_URL?.trim() ||
    process.env.KHORA_BASE_URL?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

export function resolveAgentsDataDir(): string {
  const configured = process.env.HARNESS_AGENTS_DATA_DIR?.trim();
  if (configured !== undefined && configured.length > 0) return configured;
  return path.join(process.cwd(), ".harness-data", "agents");
}

export async function createHarnessKhoraClientForAgent(opts: {
  baseUrl: string;
  agentDid: string;
  agentsDataDir?: string;
  identitySecret?: IdentitySecret;
}): Promise<KhoraClient | undefined> {
  const dataDir = opts.agentsDataDir ?? resolveAgentsDataDir();
  const keyPath = AgentStore.keyPath(dataDir, opts.agentDid);
  const secret = opts.identitySecret ?? resolveIdentitySecretFromEnv();
  const signer = await loadHarnessIdentity(keyPath, secret);
  if (signer === undefined) return undefined;
  return new KhoraClient({ baseUrl: opts.baseUrl, signer });
}
