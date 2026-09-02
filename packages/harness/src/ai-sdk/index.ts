/**
 * Optional AI SDK surface for `@khoralabs/agent-net`.
 * Core barrels stay free of `ai` / `agent-capabilities-ai-sdk`; import this entry
 * for streamText turns, structured helpers, and tool capture.
 *
 * Durable Workflow directives are owned by the host (see apps/reference/src/workflows).
 */

export { captureHarnessCapabilities } from "./capture-harness-capabilities.ts";
export {
  type PreparedHarnessStep,
  type PrepareHarnessStepInput,
  prepareHarnessStepRuntime,
} from "./prepare-harness-step.ts";
export {
  type RunAgentWorkflowDependencies,
  runAgentWorkflow,
  withAssistantText,
} from "./run-agent-workflow.ts";
export {
  type RunHarnessAgentStepArgs,
  type RunHarnessChatStepArgs,
  type RunHarnessStructuredStepArgs,
  type RunHarnessToolLoopObjectStepArgs,
  runHarnessAgentStep,
} from "./run-harness-agent-step.ts";
export {
  describeGenerationFailure,
  generateStructured,
  repairTruncatedJson,
} from "./structured-output.ts";
export { rethrowAsFatalAiNoOutput, rethrowAsRetryableTimeout } from "./workflow-errors.ts";
export {
  type AgentResponseDeps,
  runAgentResponseWithSession,
  runExecuteAgentResponse,
} from "./workflows/agent-response-run.ts";
export {
  type ClassifyResponsePlanInput,
  type ClassifyResponsePlanResult,
  loadPlannerSkillCatalog,
  mergeResponsePlanIntoParams,
  runClassifyResponsePlan,
  type SkillCatalogEntry,
} from "./workflows/classify-response-plan-run.ts";
export {
  buildNbcToolSet,
  executeNbcTool,
  type NbcNegotiationTurnParams,
  type NbcToolExecuteCtx,
  nbcMeshPostLeave,
  nbcMeshPostTurn,
  type PreparedNbcNegotiationTurn,
  runPrepareNbcTurn,
  type SerializableNbcToolDef,
} from "./workflows/nbc-prepare-turn-run.ts";
export {
  type RunNbcNegotiationModelTurnInput,
  runNbcNegotiationModelTurn,
} from "./workflows/nbc-run-model-turn-run.ts";
