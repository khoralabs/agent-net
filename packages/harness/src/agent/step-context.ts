import { formatMemoriesContextInstructions } from "./tools/memories/_helpers/memories-context-instructions.ts";
import type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
  MemoriesDatabaseContext,
} from "./types.ts";

export type {
  AgentStepContext,
  AgentStepNamespaceEntry,
  AgentStepSourceContext,
} from "./types.ts";

/** Max namespace rows rendered into prompts (remainder noted as truncated). */
export const AGENT_STEP_NAMESPACE_CATALOG_CAP = 40;

function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatNamespaceCatalog(entries: readonly AgentStepNamespaceEntry[] | undefined): string[] {
  if (entries === undefined || entries.length === 0) return [];
  const capped = entries.slice(0, AGENT_STEP_NAMESPACE_CATALOG_CAP);
  const lines = capped.map((entry) => {
    const alias = nonEmpty(entry.alias ?? undefined);
    const description = nonEmpty(entry.description);
    const label = alias !== undefined ? `${entry.namespace} (${alias})` : entry.namespace;
    return description !== undefined ? `- ${label}: ${description}` : `- ${label}`;
  });
  const header =
    entries.length > AGENT_STEP_NAMESPACE_CATALOG_CAP
      ? `Namespaces (showing ${AGENT_STEP_NAMESPACE_CATALOG_CAP} of ${entries.length}):`
      : "Namespaces:";
  return [header, ...lines];
}

function formatSourceFacet(source: AgentStepSourceContext | undefined): string[] {
  if (source === undefined) return [];
  const parts: string[] = [];
  const label = nonEmpty(source.label);
  const description = nonEmpty(source.description);
  const about = nonEmpty(source.about);
  const directives = nonEmpty(source.directives);
  const pullDirective = nonEmpty(source.pullDirective);
  if (
    label === undefined &&
    description === undefined &&
    about === undefined &&
    directives === undefined &&
    pullDirective === undefined
  ) {
    return [];
  }
  const title =
    label !== undefined
      ? `External source (${label}):`
      : source.sourceId !== undefined && source.sourceId.trim().length > 0
        ? `External source (${source.sourceId.trim()}):`
        : "External source:";
  parts.push(title);
  if (description !== undefined) parts.push(description);
  if (about !== undefined) parts.push(about);
  if (directives !== undefined) {
    parts.push(`Ingest directives:\n${directives}`);
  }
  if (pullDirective !== undefined) {
    parts.push(`Pull directive:\n${pullDirective}`);
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

  blocks.push(...formatNamespaceCatalog(context.namespaces));
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
