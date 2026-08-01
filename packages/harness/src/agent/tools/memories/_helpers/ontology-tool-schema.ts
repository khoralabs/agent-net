import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-node/ontology";
import { z } from "zod";

import type { HarnessMemoriesOntology } from "./memories-client.ts";

/** Ontology label schemas are zod; ontology types widen them to Standard Schema. */
function asZod(schema: unknown): z.ZodType {
  return schema as z.ZodType;
}

export function ontologyNodeKinds(
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>,
): string[] {
  return Object.keys(ontology.nodeLabels);
}

export function ontologyEdgeKinds(
  ontology: OntologyDefinition<LabelSchemaMap, LabelSchemaMap>,
): string[] {
  return Object.keys(ontology.edgeLabels);
}

/**
 * Optional nodeLabels map: each key is an ontology node kind; value is that kind's Zod props.
 * Aligns with integrate-memories `zNodeLabels` (without requiring at least one kind — omit for default).
 */
export function nodeLabelsInputSchema(ontology: HarnessMemoriesOntology) {
  const shape: Record<string, z.ZodType> = {};
  for (const kind of ontologyNodeKinds(ontology)) {
    shape[kind] = asZod(ontology.nodeLabels[kind])
      .optional()
      .describe(`Props when labeling this memory as "${kind}".`);
  }
  return z
    .object(shape)
    .partial()
    .optional()
    .describe(
      "Ontology node labels keyed by kind. Each value matches that kind's fields. Omit to default to memory.",
    );
}

export type ParsedMemoryLink = {
  namespace: string;
  key: string;
  direction?: "in" | "out";
  label?: string;
  props?: Record<string, unknown>;
};

/**
 * Peer link: namespace + key + direction + at most one ontology edge-kind field (props schema).
 * Same idea as integrate-memories `zEdgeRow`.
 */
export function memoryLinkSchema(
  ontology: HarnessMemoriesOntology,
  opts?: { namespaceOptional?: boolean },
) {
  const edgeKinds = ontologyEdgeKinds(ontology);
  const edgeShape: Record<string, z.ZodType> = {};
  for (const kind of edgeKinds) {
    edgeShape[kind] = asZod(ontology.edgeLabels[kind])
      .optional()
      .describe(`Set this field (and only this among edge kinds) for a "${kind}" edge.`);
  }

  const namespaceField = opts?.namespaceOptional
    ? z
        .string()
        .min(1)
        .optional()
        .describe("Peer memory namespace. Defaults to the skills namespace when omitted.")
    : z.string().min(1).describe("Peer memory namespace (from search hits).");

  const base = z.object({
    namespace: namespaceField,
    key: z.string().min(1).describe("Peer memory key (from search hits)."),
    direction: z
      .enum(["in", "out"])
      .optional()
      .describe('Edge direction from this memory to the peer. Defaults to "out".'),
    ...edgeShape,
  });

  if (edgeKinds.length === 0) {
    return base;
  }

  return base.superRefine((row, ctx) => {
    const set = edgeKinds.filter((kind) => (row as Record<string, unknown>)[kind] !== undefined);
    if (set.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: `Set at most one ontology edge kind (got ${set.join(", ")}).`,
      });
    }
  });
}

/** Normalize a parsed link row into MemoryLinkInput (default edge kind when none set). */
export function parseMemoryLinkRow(
  row: Record<string, unknown>,
  ontology: HarnessMemoriesOntology,
  defaults?: { namespace?: string },
): ParsedMemoryLink {
  const edgeKinds = ontologyEdgeKinds(ontology);
  let label: string | undefined;
  let props: Record<string, unknown> | undefined;
  for (const kind of edgeKinds) {
    const value = row[kind];
    if (value !== undefined) {
      label = kind;
      props =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      break;
    }
  }

  const namespaceRaw =
    typeof row.namespace === "string" && row.namespace.trim().length > 0
      ? row.namespace.trim()
      : defaults?.namespace;
  const key = typeof row.key === "string" ? row.key.trim() : "";
  if (namespaceRaw === undefined || namespaceRaw.length === 0) {
    throw new Error("link.namespace is required");
  }
  if (key.length === 0) {
    throw new Error("link.key is required");
  }

  const direction = row.direction === "in" || row.direction === "out" ? row.direction : undefined;

  return {
    namespace: namespaceRaw,
    key,
    ...(direction !== undefined ? { direction } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(props !== undefined ? { props } : {}),
  };
}
