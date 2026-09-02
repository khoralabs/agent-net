/**
 * Optional AI SDK surface for `@khoralabs/agent-net`.
 * Core barrels stay free of `ai` / `agent-capabilities-ai-sdk`; import this entry
 * for streamText turns, structured helpers, and tool capture.
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
export {
  agentResponse,
  startAgentResponseWorkflow,
} from "./workflows/agent-response.ts";
export {
  type AgentResponseDeps,
  runExecuteAgentResponse,
} from "./workflows/agent-response-run.ts";
export {
  executeAgentResponse,
  runAgentResponseStep,
} from "./workflows/agent-response-step.ts";
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
