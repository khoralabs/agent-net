import { captureAgentSnapshotEnvelope } from "@khoralabs/agent-capabilities";
import { resolveAgentEmbeddingModel } from "@khoralabs/memories-node/helpers/agent";
import { minimalAgentMemoriesOntology } from "@khoralabs/memories-service/client/agent";
import { generateText, Output } from "ai";
import { discoverSkillsFromMemories } from "../../agent/memories/skills/_helpers/skills.ts";
import { getInstalledMemoriesOntology } from "../../agent/memories/tools/_helpers/memories-ontology-install.ts";
import { getCapabilityRegistry, resolveGatewayModel } from "../../agent/turn/agent-runtime.ts";
import { defineResponsePlannerAgent } from "../../agent/turn/capability-agents/response-planner.ts";
import type { ResponseModelCapabilities } from "../../agent/turn/gateway-model-capabilities.ts";
import {
  anyResponsePlanKnobEnabled,
  buildResponsePlanSchema,
  extractLatestUserText,
  formatSkillCatalogForPlanner,
  normalizeResponsePlan,
  type ResolvedResponsePlanOptions,
  type ResponsePlan,
  type ResponsePlanOptions,
  resolveResponsePlanOptions,
  responsePlanOptionsFromEnv,
} from "../../agent/turn/response-plan.ts";
import {
  createAgentMemoriesClientForAgent,
  resolveMemoriesServiceAdminToken,
  resolveMemoriesServiceBaseUrl,
} from "../../agent/turn/tools/_helpers/toolkit-env.ts";
import type { AgentWorkflowParams } from "../../agent/turn/types.ts";

export type SkillCatalogEntry = {
  name: string;
  description: string;
};

export type ClassifyResponsePlanInput = {
  params: AgentWorkflowParams;
  /** From the Gateway capabilities step for the response model. */
  capabilities: ResponseModelCapabilities;
  options?: ResponsePlanOptions;
  skillCatalog?: readonly SkillCatalogEntry[];
  /** Override classifier model id (else AGENT_REASONING_CLASSIFIER_MODEL / AGENT_RESPONSE_PLANNER_MODEL). */
  classifierModelId?: string;
  generateTextFn?: typeof generateText;
};

export type ClassifyResponsePlanResult = {
  plan: ResponsePlan;
  options: ResolvedResponsePlanOptions;
  skippedLlm: boolean;
};

function resolveClassifierModelId(override?: string): string {
  const id =
    override?.trim() ||
    process.env.AGENT_RESPONSE_PLANNER_MODEL?.trim() ||
    process.env.AGENT_REASONING_CLASSIFIER_MODEL?.trim() ||
    "google/gemini-3.5-flash-lite";
  return resolveGatewayModel(id);
}

function needsLlm(
  options: ResolvedResponsePlanOptions,
  capabilities: ResponseModelCapabilities,
): boolean {
  if (!anyResponsePlanKnobEnabled(options)) return false;
  const onlyReasoning =
    options.applyReasoning &&
    !options.applyMaxSteps &&
    !options.applyMaxOutputTokens &&
    !options.applySkillHints;
  if (onlyReasoning && !capabilities.supportsReasoning) {
    return false;
  }
  return true;
}

/** Best-effort skill name/description list for the planner (empty on failure). */
export async function loadPlannerSkillCatalog(agentDid: string): Promise<SkillCatalogEntry[]> {
  try {
    const memoriesBaseUrl = resolveMemoriesServiceBaseUrl();
    const memoriesAdminToken = resolveMemoriesServiceAdminToken();
    const ontology =
      getInstalledMemoriesOntology() ??
      (memoriesBaseUrl !== undefined && memoriesAdminToken !== undefined
        ? minimalAgentMemoriesOntology
        : undefined);
    if (
      memoriesBaseUrl === undefined ||
      memoriesAdminToken === undefined ||
      ontology === undefined
    ) {
      return [];
    }
    const memoriesClient = await createAgentMemoriesClientForAgent({
      baseUrl: memoriesBaseUrl,
      agentDid,
      ontology,
      adminToken: memoriesAdminToken,
    });
    const embeddingModel = resolveAgentEmbeddingModel();
    const skills = await discoverSkillsFromMemories(memoriesClient, {
      embeddingModel,
    });
    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  } catch {
    return [];
  }
}

/**
 * Classify a response plan for the upcoming agent turn.
 * Safe to call from a host `"use step"`.
 */
export async function runClassifyResponsePlan(
  input: ClassifyResponsePlanInput,
): Promise<ClassifyResponsePlanResult> {
  const options = resolveResponsePlanOptions(input.options ?? responsePlanOptionsFromEnv());
  const { capabilities } = input;

  if (!anyResponsePlanKnobEnabled(options)) {
    return { plan: {}, options, skippedLlm: true };
  }

  if (!needsLlm(options, capabilities)) {
    const plan: ResponsePlan = {};
    if (options.applyReasoning) plan.reasoning = "none";
    return { plan, options, skippedLlm: true };
  }

  const schema = buildResponsePlanSchema(options);
  let catalog = options.applySkillHints ? [...(input.skillCatalog ?? [])] : [];
  if (options.applySkillHints && catalog.length === 0) {
    catalog = await loadPlannerSkillCatalog(input.params.agent.actingFor.id);
  }
  const catalogNames = new Set(catalog.map((skill) => skill.name));
  const userText = extractLatestUserText(input.params.context.messages);
  const catalogBlock = formatSkillCatalogForPlanner(catalog);
  const prompt = [
    catalogBlock.length > 0 ? catalogBlock : null,
    "Latest user message:",
    userText.length > 0 ? userText : "(empty)",
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");

  const defined = await defineResponsePlannerAgent(options);
  const registry = getCapabilityRegistry();
  if (!registry.has(defined.agent.agentId)) {
    await registry.register(defined.agent);
  }
  const capture = await captureAgentSnapshotEnvelope({
    agent: defined.agent,
    ctx: {
      env: {},
      agentId: defined.agent.agentId,
      agentName: defined.agent.name,
    },
    invocationContext: { runId: input.params.runId },
    sessionContext: {
      sessionId: input.params.context.sessionId ?? input.params.runId,
      threadId: input.params.context.threadId ?? input.params.runId,
    },
  });

  const runGenerateText = input.generateTextFn ?? generateText;
  const modelId = resolveClassifierModelId(input.classifierModelId);
  const result = await runGenerateText({
    model: modelId,
    output: Output.object({ schema }),
    system: capture.instructions,
    prompt,
    maxOutputTokens: 512,
  });

  const raw =
    result.output !== null && result.output !== undefined && typeof result.output === "object"
      ? (result.output as Record<string, unknown>)
      : {};
  const plan = normalizeResponsePlan(raw, options, catalogNames);

  if (options.applyReasoning && !capabilities.supportsReasoning) {
    plan.reasoning = "none";
  }

  return { plan, options, skippedLlm: false };
}

/** Merge enabled plan fields onto workflow params for the respond step. */
export function mergeResponsePlanIntoParams(
  params: AgentWorkflowParams,
  plan: ResponsePlan,
  options: ResolvedResponsePlanOptions,
): AgentWorkflowParams {
  const model = { ...params.model };
  if (options.applyReasoning && plan.reasoning !== undefined) {
    model.reasoning = plan.reasoning;
  }
  if (options.applyMaxSteps && plan.maxSteps !== undefined) {
    model.maxSteps = plan.maxSteps;
  }
  if (
    options.applyMaxOutputTokens &&
    plan.maxOutputTokens !== undefined &&
    plan.maxOutputTokens !== null
  ) {
    model.maxOutputTokens = plan.maxOutputTokens;
  }

  const next: AgentWorkflowParams = {
    ...params,
    model,
  };
  if (options.applySkillHints && plan.skillHints !== undefined && plan.skillHints.length > 0) {
    next.responsePlan = { skillHints: plan.skillHints };
  }
  return next;
}
