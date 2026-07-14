import type {
  MemoriesServiceClient,
  RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service-client";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service-storage-core";

/** A bound memories client scoped to a single agent's database. */
export type AgentMemoriesClient = {
  /** The `MemoriesDatabaseId` for this agent. Pass to `MemoriesServiceClient` for raw access. */
  readonly database: MemoriesDatabaseId;
  open(): Promise<void>;
  close(): Promise<void>;
  checkpoint(): Promise<void>;
  exists(): Promise<boolean>;
  delete(): Promise<void>;
  /** The underlying service client, for operations not covered by the shortcuts above. */
  readonly serviceClient: MemoriesServiceClient;
  /** Typed runtime client for search, merge, and delete — lazy-init on first use. */
  readonly client: RemoteMemoriesClientAsync;
};
