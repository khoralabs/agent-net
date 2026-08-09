import type { FlexibleSchema, LanguageModel } from "ai";

import {
  type PreparedHarnessStep,
  type PrepareHarnessStepInput,
  prepareHarnessStepRuntime,
} from "./prepare-harness-step.ts";
import type { RunAgentWorkflowDependencies } from "./run-agent-workflow.ts";
import { runAgentWorkflow } from "./run-agent-workflow.ts";
import { generateStructured } from "./structured-output.ts";
import type { AgentWorkflowParams, AgentWorkflowResult } from "./types.ts";

export type RunHarnessStructuredStepArgs = {
  mode: "structured";
  label: string;
  model: LanguageModel;
  schema: FlexibleSchema<unknown>;
  /** Task-specific prompt body (step context is prepended automatically). */
  prompt: string;
  prepare: PrepareHarnessStepInput;
  attempts?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

export type RunHarnessToolLoopObjectStepArgs<T> = {
  mode: "tool_loop_object";
  prepare: PrepareHarnessStepInput;
  /**
   * Host tool-loop (e.g. MemoryAdapterClient.expand). Receives prepared
   * context instructions to fold into agent instructions.
   */
  run: (prepared: PreparedHarnessStep) => Promise<T>;
};

export type RunHarnessChatStepArgs = {
  mode: "chat";
  params: AgentWorkflowParams;
  deps?: RunAgentWorkflowDependencies;
};

export type RunHarnessAgentStepArgs<T = unknown> =
  | RunHarnessStructuredStepArgs
  | RunHarnessToolLoopObjectStepArgs<T>
  | RunHarnessChatStepArgs;

function withContextPrefix(contextInstructions: string[], prompt: string): string {
  if (contextInstructions.length === 0) return prompt;
  return `${contextInstructions.join("\n\n")}\n\n${prompt}`;
}

/**
 * Mode-aware LLM invoke sharing {@link prepareHarnessStepRuntime}.
 * - `chat` → {@link runAgentWorkflow}
 * - `structured` → {@link generateStructured} with formatted step context prefix
 * - `tool_loop_object` → caller tool-loop with prepared context instructions
 */
export async function runHarnessAgentStep(
  args: RunHarnessChatStepArgs,
): Promise<AgentWorkflowResult>;
export async function runHarnessAgentStep<T>(
  args: RunHarnessStructuredStepArgs | RunHarnessToolLoopObjectStepArgs<T>,
): Promise<T>;
export async function runHarnessAgentStep<T>(
  args: RunHarnessAgentStepArgs<T>,
): Promise<T | AgentWorkflowResult> {
  if (args.mode === "chat") {
    return runAgentWorkflow(args.params, args.deps ?? {});
  }

  const prepared = await prepareHarnessStepRuntime(args.prepare);

  if (args.mode === "tool_loop_object") {
    return args.run(prepared);
  }

  return generateStructured<T>({
    label: args.label,
    model: args.model,
    schema: args.schema,
    prompt: withContextPrefix(prepared.contextInstructions, args.prompt),
    ...(args.attempts !== undefined ? { attempts: args.attempts } : {}),
    ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
    ...(args.maxOutputTokens !== undefined ? { maxOutputTokens: args.maxOutputTokens } : {}),
  });
}
