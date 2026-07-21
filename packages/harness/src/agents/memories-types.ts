import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-ontologies";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import type {
  MemoriesServiceClient,
  RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service/client";

/** A bound memories client scoped to a single agent's database. */
export type AgentMemoriesClient = {
  /** The `MemoriesDatabaseId` for this agent. Pass to `MemoriesServiceClient` for raw access. */
  readonly database: MemoriesDatabaseId;
  /** Ontology provided at spawn for this agent's memories DB. */
  readonly ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;
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
