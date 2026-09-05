/**
 * Negotiate / NBC / Vellum control-plane surface.
 * Prefer this entry over the package root for channel negotiation.
 */
export {
  type NegotiationTurnWire,
  negotiationOutputToWire,
} from "./nbc/action.ts";
export type {
  NbcLoopChain,
  NbcLoopHost,
  NbcLoopStartTurnInput,
  NbcLoopStatusPatch,
} from "./nbc/loop-host.ts";
export {
  createNbcChainChangeBus,
  type NbcChainChangeBus,
  type NbcChainChanged,
} from "./nbc/nbc-chain-change-bus.ts";
export {
  type NbcInternalLoadGraphInput,
  type NbcInternalNegotiationChain,
  type NbcInternalNegotiationHost,
  type RegisterNbcInternalNegotiationRoutesInput,
  registerNbcInternalNegotiationRoutes,
} from "./nbc/nbc-internal-routes.ts";
export { type NbcLoopHandle, startNbcLoop } from "./nbc/nbc-loop.ts";
export {
  createNbcMeshClient,
  type NbcMeshClient,
  type NbcNegotiationStateResponse,
} from "./nbc/nbc-mesh-client.ts";
export { startNbcReplicaWatch } from "./nbc/nbc-replica-watch.ts";
export { nbcTurnContext } from "./nbc/nbc-turn-context.ts";
export {
  createNbcWakeDispatcher,
  resetNbcWakeDispatcherForTests,
} from "./nbc/nbc-wake-dispatcher.ts";
export {
  buildNegotiationInstructions,
  buildNegotiationUserMessage,
  type NegotiationBrief,
  summarizeNbcGraph,
} from "./nbc/prompt.ts";
export {
  type RunNbcModelTurnInput,
  runNbcModelTurn,
} from "./nbc/run-nbc-model-turn.ts";
export {
  type NegotiationPortDefinition,
  type NegotiationTurnEnvelope,
  type NegotiationTurnEnvelopeContext,
  negotiationTurnEnvelopeSchema,
  parseNegotiationTurnEnvelope,
} from "./nbc/turn-output-schema.ts";
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
} from "./nbc/who-should-act.ts";
export {
  AgentSocialNegotiate,
  type NegotiateStartResult,
  type VellumHandle,
} from "./negotiate.ts";
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
} from "./vellum.ts";
export { vellumPoolAttachmentDataDir } from "./vellum-pool-paths.ts";
export {
  type CommitTurnResult,
  type CreateVellumChainSessionRegistryOptions,
  createVellumChainSessionRegistry,
  NBC_GENESIS_NOT_INITIATOR,
  type VellumChainLiveSession,
  type VellumChainSessionRegistry,
} from "./vellum-sessions.ts";
