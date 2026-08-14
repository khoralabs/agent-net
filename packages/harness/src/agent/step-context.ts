import { formatMemoriesContextInstructions } from "./tools/memories/_helpers/memories-context-instructions.ts";
import type { AgentStepContext, AgentStepSourceContext, MemoriesDatabaseContext } from "./types.ts";

export type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
} from "./types.ts";

function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatSourceFacet(source: AgentStepSourceContext | undefined): string[] {
  if (source === undefined) return [];
  const parts: string[] = [];
  for (const line of source.instructions ?? []) {
    const trimmed = nonEmpty(line);
    if (trimmed !== undefined) parts.push(trimmed);
  }
  return parts;
}

export type FormatAgentStepContextOptions = {
  /**
   * Skip database facet (chat path: memories toolkit already injects DB framing).
   * Integrate structured/tool-loop prompts should leave this unset.
   */
  omitDatabase?: boolean;
};

/**
 * Ordered instruction blocks for an LLM step. Empty facets are omitted.
 * Namespace catalogs are not rendered — agents discover via searchNamespaces.
 * Database facet uses the same lines as the memories toolkit when present;
 * when absent, no generic DB blurb is emitted (toolkit adds that separately).
 */
export function formatAgentStepContext(
  context: AgentStepContext | undefined,
  opts?: FormatAgentStepContextOptions,
): string[] {
  if (context === undefined) return [];
  const blocks: string[] = [];

  if (opts?.omitDatabase !== true && context.database !== undefined) {
    blocks.push(...formatMemoriesContextInstructions(context.database));
  }

  blocks.push(...formatSourceFacet(context.source));

  for (const instruction of context.turn?.instructions ?? []) {
    const trimmed = instruction.trim();
    if (trimmed.length > 0) blocks.push(trimmed);
  }

  return blocks;
}

/** Merge legacy `memoriesDatabase` + optional `stepContext` into one bag. */
export function resolveAgentStepContext(input: {
  stepContext?: AgentStepContext;
  memoriesDatabase?: MemoriesDatabaseContext;
  turnInstructions?: string[];
}): AgentStepContext | undefined {
  const base = input.stepContext;
  const database = base?.database ?? input.memoriesDatabase;
  const turnInstructions = [
    ...(base?.turn?.instructions ?? []),
    ...(input.turnInstructions ?? []),
  ].filter((line) => line.trim().length > 0);
  const hasNamespaces = (base?.namespaces?.length ?? 0) > 0;
  const hasSource = base?.source !== undefined;
  const hasTurn = turnInstructions.length > 0;
  if (database === undefined && !hasNamespaces && !hasSource && !hasTurn) {
    return undefined;
  }
  return {
    ...(database !== undefined ? { database } : {}),
    ...(hasNamespaces ? { namespaces: base?.namespaces } : {}),
    ...(hasSource ? { source: base?.source } : {}),
    ...(hasTurn ? { turn: { instructions: turnInstructions } } : {}),
  };
}
