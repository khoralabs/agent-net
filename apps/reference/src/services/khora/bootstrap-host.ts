import {
  bootstrapHostSearch,
  createKhoraHost,
  type KhoraHostContext,
  parseInviteSeedTokens,
  readInvitePepper,
  startEmbeddingRetryWorker,
  validateInviteEnvConfig,
} from "@khoralabs/khora-host";
import type { KhoraEncryptionContext } from "@khoralabs/khora-host/bootstrap";
import {
  createKhoraInvitesSqliteRepo,
  createSqliteKhoraHostFoundation,
} from "@khoralabs/khora-host/sqlite";
import {
  ensureCustomSqliteForExtensions,
  getMemoriesSqliteDatabase,
} from "@khoralabs/memories-node/sqlite";
import { createLocalSqliteServiceStack } from "@khoralabs/memories-service/storage/sqlite";

import {
  assertKhoraMemoriesDbPathUnset,
  type KhoraMemoriesBootstrapConfig,
} from "./memories-env.ts";
import { migrateLegacyPendingEmbeddingsFromMemoriesDb } from "./migrate-legacy-pending-embeddings.ts";

export type BootstrapKhoraHostOpts = {
  hostDbPath: string;
  catalogDbPath: string;
  authNoncesDbPath: string;
  percolatorDbPath: string;
  cellsDir: string;
  useCellWorkers: boolean;
  tenantKey?: string;
  memories?: KhoraMemoriesBootstrapConfig;
  encryption: KhoraEncryptionContext;
  startPrincipalTeardownWorker?: boolean;
};

export type KhoraHostBootstrap = {
  ctx: KhoraHostContext;
};

export async function bootstrapKhoraHost(
  opts: BootstrapKhoraHostOpts,
): Promise<KhoraHostBootstrap> {
  if (opts.memories !== undefined) {
    ensureCustomSqliteForExtensions();
  }

  const encryption = opts.encryption;
  let memories: ReturnType<typeof bootstrapHostSearch> | undefined;
  let invitesRepoValue: ReturnType<typeof createKhoraInvitesSqliteRepo> | undefined;

  const foundation = await createSqliteKhoraHostFoundation({
    hostDbPath: opts.hostDbPath,
    catalogDbPath: opts.catalogDbPath,
    authNoncesDbPath: opts.authNoncesDbPath,
    percolatorDbPath: opts.percolatorDbPath,
    cellsDir: opts.cellsDir,
    useCellWorkers: opts.useCellWorkers,
    encryption: {
      sqlCipherKey: encryption.sqlCipherKey,
      outboxPayloadCodec: encryption.outboxPayloadCodec,
      outboxKeyHex: encryption.outboxKeyHex,
    },
    ...(opts.tenantKey !== undefined ? { tenantKey: opts.tenantKey } : {}),
    ...(opts.memories?.embeddingModel !== undefined
      ? { embeddingModel: opts.memories.embeddingModel }
      : {}),
    async onPrincipalTeardown(_principalId, profileId) {
      await memories?.indexer.deleteProfile(profileId);
    },
    onPhase1Teardown(principalId, profileId) {
      invitesRepoValue?.deleteTokensForPrincipal(principalId);
      void memories?.indexer.deleteProfile(profileId);
    },
  });

  const seedTokens = parseInviteSeedTokens(process.env.KHORA_INVITE_SEED_TOKENS);
  validateInviteEnvConfig(seedTokens);
  const pepper = readInvitePepper();
  if (pepper !== undefined && pepper.length > 0) {
    const repo = createKhoraInvitesSqliteRepo(foundation.hostDb, pepper);
    repo.insertSeedInviteTokens(seedTokens);
    repo.ensureRootInviteIfAbsent();
    invitesRepoValue = repo;
  }

  if (opts.memories !== undefined) {
    assertKhoraMemoriesDbPathUnset();

    const stack = createLocalSqliteServiceStack({
      dataDir: opts.memories.memoriesDataDir,
      ...(encryption.sqlCipherKey !== undefined ? { sqlCipherKey: encryption.sqlCipherKey } : {}),
    });

    const handle = await stack.service.getHandle(opts.memories.databaseId);
    const pendingEmbeddings = foundation.persistence.pendingEmbeddings;
    const syncPersistence = handle.sync?.syncPersistence;
    if (syncPersistence !== undefined) {
      migrateLegacyPendingEmbeddingsFromMemoriesDb(
        getMemoriesSqliteDatabase(syncPersistence),
        pendingEmbeddings,
      );
    }
    let embeddingRetryWorker: ReturnType<typeof startEmbeddingRetryWorker> | undefined;

    memories = bootstrapHostSearch({
      persistence: handle.persistence,
      close: () => {
        embeddingRetryWorker?.stop();
        void handle.close();
      },
      persistenceClient: foundation.persistenceClient,
      postResolver: foundation.postResolver,
      embeddingModel: opts.memories.embeddingModel,
      namespaceRoot: opts.memories.namespaceRoot,
      onEmbeddingFailure: ({ namespace, memoryKey, sourceKey, text }) => {
        pendingEmbeddings.enqueue({ namespace, memoryKey, sourceKey, text });
      },
    });
    embeddingRetryWorker = startEmbeddingRetryWorker({
      queue: pendingEmbeddings,
      client: memories.client,
      embeddingModel: opts.memories.embeddingModel,
    });
  }

  // Published host entrypoints (`./sqlite` vs `.`) re-declare private classes in
  // separate .d.ts bundles; cast across that boundary.
  const ctx = createKhoraHost({
    persistence: foundation.persistence,
    tenantKey: foundation.tenantKey,
    cluster: foundation.cluster,
    publicationClient: foundation.publicationClient,
    cellPoolCount: foundation.cellPoolCount,
    auth: foundation.auth,
    principalLifecycle: foundation.principalLifecycle,
    registration: foundation.registration,
    health: foundation.health,
    adminStats: foundation.adminStats,
    hostSpec: foundation.hostSpec,
    outboxPayloadCodec: foundation.outboxPayloadCodec,
    subscriptions: foundation.subscriptions,
    ...(invitesRepoValue !== undefined ? { invitesRepo: invitesRepoValue } : {}),
    ...(memories !== undefined ? { search: memories } : {}),
    ...(opts.startPrincipalTeardownWorker !== undefined
      ? { startPrincipalTeardownWorker: opts.startPrincipalTeardownWorker }
      : {}),
  } as unknown as Parameters<typeof createKhoraHost>[0]);
  return { ctx };
}
