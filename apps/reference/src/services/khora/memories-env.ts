import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import type { KhoraPersistencePaths } from "./persistence-paths.ts";

/** Permanent host memories identity for the Khora host. */
export const KHORA_HOST_MEMORIES_DATABASE_ID = {
  kind: "host",
  ownerKey: "khora",
} as const;

export type KhoraHostMemoriesDatabaseId = typeof KHORA_HOST_MEMORIES_DATABASE_ID;

export const DEFAULT_HOST_SEARCH_NAMESPACE_ROOT = "global";

export type KhoraMemoriesBootstrapConfig = {
  memoriesDataDir: string;
  databaseId: KhoraHostMemoriesDatabaseId;
  embeddingModel?: EmbeddingModel;
  namespaceRoot?: string;
};

/** Default on when unset. Set `KHORA_MEMORIES=0` / `false` / `off` / `no` to disable. */
export function envMemoriesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.KHORA_MEMORIES?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

export function readKhoraMemoriesNamespaceRoot(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.KHORA_MEMORIES_NAMESPACE_ROOT?.trim();
  return raw !== undefined && raw.length > 0 ? raw : DEFAULT_HOST_SEARCH_NAMESPACE_ROOT;
}

/**
 * Host search index config (lexical-only unless an embedding model is wired later).
 * Reference demos do not require Google embeddings.
 */
export function envMemoriesBootstrapConfig(
  paths: Pick<KhoraPersistencePaths, "memoriesDataDir">,
  env: NodeJS.ProcessEnv = process.env,
): KhoraMemoriesBootstrapConfig | undefined {
  if (!envMemoriesEnabled(env)) {
    return undefined;
  }
  return {
    memoriesDataDir: paths.memoriesDataDir,
    databaseId: KHORA_HOST_MEMORIES_DATABASE_ID,
    namespaceRoot: readKhoraMemoriesNamespaceRoot(env),
  };
}

/** Reject removed `KHORA_MEMORIES_DB_PATH`; host memories use `{KHORA_DATA_DIR}/memories`. */
export function assertKhoraMemoriesDbPathUnset(env: NodeJS.ProcessEnv = process.env): void {
  const raw = env.KHORA_MEMORIES_DB_PATH?.trim();
  if (raw !== undefined && raw.length > 0) {
    throw new Error(
      'KHORA_MEMORIES_DB_PATH is no longer supported; unset it. Host memories use {KHORA_DATA_DIR}/memories (database id { kind: "host", ownerKey: "khora" }).',
    );
  }
}
