/**
 * Read an NBC chain graph from a local Vellum channel sqlite file.
 *
 * **Temporary** — direct sqlite + OBP collect replaces Vellum snapshot helpers
 * used by the wake loop and internal GET state until replicas expose graph state
 * without reading attachment files on disk.
 */
import { createObpSqlitePersistenceClient, openObpDatabase } from "@khoralabs/obp-core/sqlite";
import { collectNbcChainGraph, type NbcChainGraph } from "@khoralabs/obp-nbc";
import { channelSqlitePath } from "@khoralabs/vellum-client";

export type LoadNbcChainGraphInput = {
  /** Agent vellum data dir that owns the channel sqlite (typically initiator). */
  dataDir: string;
  channelId: string;
};

/**
 * Read an NBC chain graph from a Vellum channel sqlite file.
 */
export async function loadNbcChainGraph(input: LoadNbcChainGraphInput): Promise<NbcChainGraph> {
  const sqlitePath = channelSqlitePath(input.dataDir, input.channelId);
  const db = openObpDatabase(sqlitePath);
  try {
    const client = createObpSqlitePersistenceClient(db);
    return await collectNbcChainGraph(client, {
      timing: { turnSeq: 0, effectiveNowMs: Date.now() },
    });
  } finally {
    db.close();
  }
}

export type { NbcChainGraph };
