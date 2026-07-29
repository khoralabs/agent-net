import path from "node:path";

import type { IdentitySecret } from "@khoralabs/did-key-identity";
import { KhoraClient } from "@khoralabs/khora-client";
import { AgentStore } from "../../../../agents/index.ts";
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
  const base = process.env.DATA_DIR?.trim() || process.cwd();
  const configured = process.env.HARNESS_AGENTS_DATA_DIR?.trim();
  if (configured !== undefined && configured.length > 0) {
    return path.resolve(base, configured);
  }
  const harnessData = process.env.HARNESS_DATA_DIR?.trim();
  if (harnessData !== undefined && harnessData.length > 0) {
    return path.join(path.resolve(base, harnessData), "agents");
  }
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
