import {
  canonicalKnowledgeNodeLabelShapes,
  canonicalRelationEdgeLabelShapes,
  canonicalTemporalEdgeLabelShapes,
  canonicalTemporalNodeLabelShapes,
  defineOntology,
  mergeOntologies,
  salienceMemoryOntology,
} from "@khoralabs/memories-ontologies";

const referenceKnowledgeGraphOntology = defineOntology({
  nodeLabels: {
    ...canonicalKnowledgeNodeLabelShapes,
    ...canonicalTemporalNodeLabelShapes,
  },
  edgeLabels: {
    ...canonicalRelationEdgeLabelShapes,
    ...canonicalTemporalEdgeLabelShapes,
  },
});

/** Reference agent memories ontology: salience, knowledge, temporal, and relation families. */
export const referenceMemoriesOntology = mergeOntologies(
  salienceMemoryOntology,
  referenceKnowledgeGraphOntology,
);

export const REFERENCE_MEMORY_LINK_LABEL = "References" as const;
