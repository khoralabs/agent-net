export type { AgentActor } from "./agent/actor.ts";
export type { BindAgentServicesOptions } from "./agent/handle.ts";
export {
  AgentHandle,
  type AgentHandleOptions,
} from "./agent/handle.ts";
export {
  type IntegrateMemoryWriteScope,
  isIntegrateMemoryWriteScope,
  isUnderNamespace,
  parseIntegrateMemoryWriteScope,
  resolveWriteNamespaceChoice,
  type WriteScopeNeighborSearchOptions,
  writeScopeNamespaceCandidates,
  writeScopeNeedsNamespaceChoice,
  writeScopeNeighborSearchOptions,
} from "./agent/memories/integrate/write-scope.ts";
export {
  getInstalledMemoriesOntology,
  installMemoriesOntology,
} from "./agent/memories/tools/_helpers/memories-ontology-install.ts";
export {
  type AgentMemoriesClient,
  createBoundAgentMemoriesClient,
} from "./agent/memories-types.ts";
export {
  type AgentChatClient,
  type ChatServiceClient,
  type CreateAgentThreadInput,
  type CreateHarnessChatBackendOptions,
  type CreateRemoteHarnessChatOptions,
  createHarnessChatBackend,
  createRemoteHarnessChat,
  HARNESS_CHAT_CHANNEL_ID,
  type HarnessChatFetch,
  harnessChatFetch,
  installHarnessChatFetch,
  type SignedChatBackend,
} from "./agent/social/message/chat.ts";
export {
  ensureThread,
  getAgentChatClient,
  getAgentChatClientForDid,
  getAgentChatService,
  getDevAgentDid,
  installAgentChat,
  resolveAgentChatSigner,
} from "./agent/social/message/chat-service.ts";
export { AgentSocialMessage } from "./agent/social/message/message.ts";
export {
  type NegotiationTurnWire,
  negotiationOutputToWire,
} from "./agent/social/negotiate/nbc/action.ts";
export type {
  NbcLoopChain,
  NbcLoopHost,
  NbcLoopStartTurnInput,
  NbcLoopStatusPatch,
} from "./agent/social/negotiate/nbc/loop-host.ts";
export {
  createNbcChainChangeBus,
  type NbcChainChangeBus,
  type NbcChainChanged,
} from "./agent/social/negotiate/nbc/nbc-chain-change-bus.ts";
export {
  type NbcInternalNegotiationChain,
  type NbcInternalNegotiationHost,
  type RegisterNbcInternalNegotiationRoutesInput,
  registerNbcInternalNegotiationRoutes,
} from "./agent/social/negotiate/nbc/nbc-internal-routes.ts";
export { type NbcLoopHandle, startNbcLoop } from "./agent/social/negotiate/nbc/nbc-loop.ts";
export {
  createNbcMeshClient,
  type NbcMeshClient,
  type NbcNegotiationStateResponse,
} from "./agent/social/negotiate/nbc/nbc-mesh-client.ts";
export { startNbcReplicaWatch } from "./agent/social/negotiate/nbc/nbc-replica-watch.ts";
export { nbcTurnContext } from "./agent/social/negotiate/nbc/nbc-turn-context.ts";
export {
  createNbcWakeDispatcher,
  resetNbcWakeDispatcherForTests,
} from "./agent/social/negotiate/nbc/nbc-wake-dispatcher.ts";
export {
  buildNegotiationInstructions,
  buildNegotiationUserMessage,
  type NegotiationBrief,
  summarizeNbcGraph,
} from "./agent/social/negotiate/nbc/prompt.ts";
export {
  type RunNbcModelTurnInput,
  runNbcModelTurn,
} from "./agent/social/negotiate/nbc/run-nbc-model-turn.ts";
export {
  type NegotiationPortDefinition,
  type NegotiationTurnEnvelope,
  type NegotiationTurnEnvelopeContext,
  negotiationTurnEnvelopeSchema,
  parseNegotiationTurnEnvelope,
} from "./agent/social/negotiate/nbc/turn-output-schema.ts";
export {
  type AvailablePeerPort,
  availablePeerPorts,
  clampMaxTurns,
  NBC_DEFAULT_MAX_TURNS,
  NBC_MAX_TURNS_CAP,
  type NegotiationChainView,
  type WhoShouldActResult,
  whoShouldAct,
  whoShouldActWithChainState,
} from "./agent/social/negotiate/nbc/who-should-act.ts";
export {
  AgentSocialNegotiate,
  type NegotiateStartResult,
  type VellumHandle,
} from "./agent/social/negotiate/negotiate.ts";
export {
  createHarnessVellumPool,
  createSharedUplinkVellumPool,
  disconnectVellum,
  type HarnessVellumPoolOptions,
  openVellumChain,
  type SharedUplinkVellumPoolOptions,
  type VellumPairOptions,
  wrapPoolClient,
  wrapVellumPoolClient,
} from "./agent/social/negotiate/vellum.ts";
export { vellumPoolAttachmentDataDir } from "./agent/social/negotiate/vellum-pool-paths.ts";
export {
  type CommitTurnResult,
  type CreateVellumChainSessionRegistryOptions,
  createVellumChainSessionRegistry,
  NBC_GENESIS_NOT_INITIATOR,
  type VellumChainLiveSession,
  type VellumChainSessionRegistry,
} from "./agent/social/negotiate/vellum-sessions.ts";
export { AgentSocial, type SocialInvitation } from "./agent/social/social.ts";
export { resolveAgentsDataDir } from "./agent/social/tools/_helpers/khora-client-factory.ts";
export {
  AGENT_MEMORY_DOMAIN,
  type AgentMemoryEntity,
  type AgentMemoryEntityMap,
  type AgentMemoryLocators,
  type AgentMemorySourceRef,
  type AgentMemoryStore,
  agentMemoryChatSource,
  agentMemorySourceRef,
  createAgentMemoryStore,
  isAgentMemorySourceRef,
  sourcesFromMemoryToolParts,
} from "./agent/turn/agent-memory-source.ts";
export {
  configureHarnessAgentRegistry,
  configureHarnessCapabilityTurnHook,
  getAgentRegistry,
  getCapabilityRegistry,
  type OnCapabilityTurn,
  resetHarnessAgentRegistryForTests,
} from "./agent/turn/agent-runtime.ts";
export type { AgentTurnParams, AgentTurnResult, AgentUIMessage } from "./agent/turn/agent-turn.ts";
export { HARNESS_AGENT_ID } from "./agent/turn/capability-agents/index.ts";
export { NETWORK_NEGOTIATION_AGENT_ID } from "./agent/turn/capability-agents/network-negotiation-agent.ts";
export {
  formatAgentStepContext,
  resolveAgentStepContext,
} from "./agent/turn/step-context.ts";
export {
  AGENT_DATABASE_DOMAIN,
  type AgentDatabaseEntity,
  type AgentDatabaseEntityMap,
  type AgentDatabaseSourceRef,
  type AgentDatabaseStore,
  agentDatabaseSourceRef,
  isAgentDatabaseSourceRef,
  isNamespaceCatalogSourceRef,
  type MemoriesContextRefs,
  mergeAgentStepContextFacets,
  NAMESPACE_CATALOG_DOMAIN,
  type NamespaceCatalogEntity,
  type NamespaceCatalogEntityMap,
  type NamespaceCatalogSourceRef,
  type NamespaceCatalogStore,
  namespaceCatalogSourceRef,
  resolveMemoriesStepContextFacets,
} from "./agent/turn/step-context-sources.ts";
export { HARNESS_TOOLKIT, type HarnessToolkitId } from "./agent/turn/tools/ids.ts";
export type { HarnessMemorySearchExtensions, NbcToolkitContext } from "./agent/turn/tools/types.ts";
export type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
  AgentWorkflowParams,
  AgentWorkflowResult,
  HarnessAgentExecutor,
  MemoriesDatabaseContext,
  MemorySearchAgentExecutor,
  MemorySearchAgentMessage,
  MemorySearchAgentRunResult,
  MemorySearchSessionContextSlice,
} from "./agent/turn/types.ts";
export {
  AI_STEP_MAX_RETRIES,
  AI_STEP_TIMEOUT_MS,
  isAbortError,
} from "./agent/turn/workflow-resilience.ts";
export {
  requireChatBaseUrl,
  requireChatToken,
  resolveChatBaseUrlFromEnv,
  resolveChatTokenFromEnv,
} from "./lib/chat-base-url.ts";
export {
  inboxEventPostId,
  inboxEventPostIds,
  inboxHasPost,
  inboxPostAuthorDid,
} from "./lib/inbox.ts";
export { requireKhoraBaseUrl, resolveKhoraBaseUrlFromEnv } from "./lib/khora-base-url.ts";
export {
  requireMemoriesAdminToken,
  requireMemoriesBaseUrl,
} from "./lib/memories-base-url.ts";
export { requireRelayBaseUrl } from "./lib/relay-base-url.ts";
export {
  type HarnessAgentWorkflowDeps,
  harnessAgentsDataDir,
  type NetworkHarnessHandle,
  startNetworkHarness,
} from "./pool/host/harness.ts";
export {
  type AgentMemoriesFraming,
  type AgentRecord,
  AgentStore,
  HARNESS_IDENTITY_WRAP_KEY_ENV,
  HarnessPoolInbox,
  type InboxConnection,
  type InboxConnectionHandle,
  loadHarnessIdentity,
  ManagedAgentPool,
  type PoolAgentRegistry,
  type PoolInboxEvent,
  type PoolInboxLifecycleHandler,
  type PoolInboxOptions,
  parseIdentityWrapKey,
  requireIdentitySecret,
  resolveIdentitySecretFromEnv,
  saveHarnessIdentity,
  wrapKeySecretFromBytes,
} from "./pool/index.ts";
export {
  emitNetworkEvent,
  installNetworkEventsPlugin,
  type ListNetworkEventsOptions,
  listNetworkEvents,
  type NetworkEventsPlugin,
  networkEventId,
} from "./pool/network/index.ts";
export type {
  NetworkAttribution,
  NetworkEvent,
  ThreadHashSnapshot,
} from "./pool/network/types.ts";
export { buildNetworkAttribution } from "./pool/observability/attribution-digest.ts";
export type {
  CreateHarnessLoggerOptions,
  HarnessObservability,
} from "./pool/observability/harness-observability.ts";
export {
  createHarnessAgentTelemetry,
  getHarnessMemoriesTelemetry,
  getHarnessObservability,
  installHarnessObservability,
  resetHarnessObservabilityForTests,
} from "./pool/observability/harness-observability.ts";
export {
  bindNetworkSessionContext,
  clearNetworkSessionContext,
  getCurrentAttribution,
  getNetworkSessionContext,
} from "./pool/observability/network-log.ts";
export { PerAgentInviteBank } from "./pool/per-agent-invite-bank.ts";
