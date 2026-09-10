export {
  HARNESS_IDENTITY_WRAP_KEY_ENV,
  loadHarnessIdentity,
  parseIdentityWrapKey,
  requireIdentitySecret,
  resolveIdentitySecretFromEnv,
  saveHarnessIdentity,
  wrapKeySecretFromBytes,
} from "./identity-wrap-key.ts";
export type {
  HarnessPoolInboxOptions,
  InboxConnection,
  InboxConnectionHandle,
  PoolInboxEvent,
  PoolInboxLifecycleHandler,
  PoolInboxOptions,
} from "./inbox/pool-inbox.ts";
/** @deprecated Prefer {@link HarnessPoolInbox} / harness.subscribeInbox. */
export { connectPoolInbox, HarnessPoolInbox } from "./inbox/pool-inbox.ts";
export {
  type CreateInboxReactorOptions,
  createInboxReactor,
  type InboxFilter,
  type InboxHandler,
  type InboxReactor,
  type WaitForPostInput,
} from "./inbox/reactor.ts";
export {
  type CreateKhoraPublicPostFeedOptions,
  createKhoraPublicPostFeed,
  type KhoraPublicPostFeed,
  KhoraPublicPostFeedError,
  type KhoraPublicPostFeedListParams,
  type KhoraPublicPostFeedNewerCountParams,
} from "./khora-public-post-feed.ts";
export {
  emitNetworkEvent,
  getInstalledNetworkEventsPlugin,
  getNetworkSession,
  installNetworkEventsPlugin,
  type ListNetworkEventsOptions,
  listNetworkEvents,
  type NetworkAgentWorkflowDeps,
  type NetworkAttribution,
  type NetworkEvent,
  type NetworkEventSource,
  type NetworkEventsPlugin,
  type NetworkRuntimeSession,
  networkEventId,
  registerNetworkSession,
  removeNetworkSession,
  requireNetworkSession,
  resetNetworkSessionRegistryForTests,
  type ThreadHashSnapshot,
} from "./network/index.ts";
export {
  type AttributionCapabilities,
  buildNetworkAttribution,
} from "./observability/attribution-digest.ts";
export type {
  CreateHarnessLoggerOptions,
  HarnessObservability,
} from "./observability/harness-observability.ts";
export {
  createHarnessAgentTelemetry,
  getHarnessMemoriesTelemetry,
  getHarnessObservability,
  installHarnessObservability,
  resetHarnessObservabilityForTests,
} from "./observability/harness-observability.ts";
export {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getCurrentAttribution,
  getNetworkSessionContext,
} from "./observability/network-log.ts";
export type { AgentCallback, ManagedAgentPoolOptions, SpawnAgentOptions } from "./pool.ts";
export { ManagedAgentPool } from "./pool.ts";
export {
  POOL_AGENT_QUERY_DEFAULT_LIMIT,
  POOL_AGENT_QUERY_MAX_LIMIT,
  type PoolAgentListItem,
  type PoolAgentOrderBy,
  type PoolAgentPage,
  type PoolAgentQuery,
  queryPoolAgents,
} from "./query.ts";
export {
  type AgentMemoriesFraming,
  type AgentRecord,
  AgentStore,
  type PoolAgentRegistry,
} from "./store.ts";
