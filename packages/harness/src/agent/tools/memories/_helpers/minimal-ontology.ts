import { defineOntology } from "@khoralabs/memories-node/ontology";
import { z } from "zod";

/** Default node label kind applied by harness memory writes. */
export const HARNESS_MEMORY_NODE_KIND = "Memory" as const;

/** Default edge label kind when a write omits `link.label`. */
export const HARNESS_MEMORY_EDGE_KIND = "References" as const;

const emptyProps = z.object({});

/**
 * Minimal ontology so harness write tools can label nodes/edges without requiring
 * every app ontology to define those kinds. Apps merge their own ontology on top
 * via {@link resolveHarnessMemoriesOntology}; app keys win on collision.
 */
export const minimalHarnessMemoriesOntology = defineOntology({
  nodeLabels: {
    [HARNESS_MEMORY_NODE_KIND]: emptyProps.describe(
      "Generic text memory written by harness tools.",
    ),
  },
  edgeLabels: {
    [HARNESS_MEMORY_EDGE_KIND]: emptyProps.describe(
      "Default peer link when writeMemory omits an edge label kind.",
    ),
  },
});
