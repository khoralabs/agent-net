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
export type { AgentCallback, ManagedAgentPoolOptions } from "./pool.ts";
export { ManagedAgentPool } from "./pool.ts";
export {
  type AgentMemoriesFraming,
  type AgentRecord,
  AgentStore,
  type PoolAgentRegistry,
} from "./store.ts";
