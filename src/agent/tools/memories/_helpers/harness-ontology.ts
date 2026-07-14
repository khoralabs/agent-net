import {
  canonicalKnowledgeNodeLabelShapes,
  canonicalRelationEdgeLabelShapes,
  canonicalTemporalEdgeLabelShapes,
  canonicalTemporalNodeLabelShapes,
  defineOntology,
  mergeOntologies,
  salienceMemoryOntology,
} from "@khoralabs/memories-ontologies";

const harnessKnowledgeGraphOntology = defineOntology({
  nodeLabels: {
    ...canonicalKnowledgeNodeLabelShapes,
    ...canonicalTemporalNodeLabelShapes,
  },
  edgeLabels: {
    ...canonicalRelationEdgeLabelShapes,
    ...canonicalTemporalEdgeLabelShapes,
  },
});

/** Agent memory client ontology: salience, knowledge, temporal, and relation families. */
export const harnessMemoriesOntology = mergeOntologies(
  salienceMemoryOntology,
  harnessKnowledgeGraphOntology,
);

export const HARNESS_MEMORY_LINK_LABEL = "references" as const;
