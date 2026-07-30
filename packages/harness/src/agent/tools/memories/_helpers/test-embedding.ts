import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";

import {
  installMemoriesOntology,
  resetMemoriesOntologyForTests,
} from "./memories-ontology-install.ts";
import { minimalHarnessMemoriesOntology } from "./minimal-ontology.ts";

/** Deterministic embedding model for unit tests (no network). */
export function createTestEmbeddingModel(): EmbeddingModel {
  return {
    model: {
      specificationVersion: "v2",
      provider: "test",
      modelId: "test-embed",
      maxEmbeddingsPerCall: 64,
      supportsParallelCalls: true,
      async doEmbed({ values }: { values: string[] }) {
        return {
          embeddings: values.map((_, i) => [0.01 * (i + 1), 0.02, 0.03]),
        };
      },
    } as EmbeddingModel["model"],
    textBatchSize: 32,
  };
}

export function installTestMemoriesOntology(): void {
  installMemoriesOntology(minimalHarnessMemoriesOntology);
}

export function resetTestMemoriesOntology(): void {
  resetMemoriesOntologyForTests();
}
