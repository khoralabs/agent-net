import type { EmbeddingModel } from "@khoralabs/memories-node/helpers";
import { minimalAgentMemoriesOntology } from "@khoralabs/memories-service/client/agent";
import {
  installMemoriesOntology,
  resetMemoriesOntologyForTests,
} from "./memories-ontology-install.ts";

/** Deterministic embedding model for unit tests (no network). */
export function createTestEmbeddingModel(): EmbeddingModel {
  return {
    model: {
      // ai@7 expects v3/v4; v2 triggers specificationVersion compatibility warnings.
      specificationVersion: "v3",
      provider: "test",
      modelId: "test-embed",
      maxEmbeddingsPerCall: 64,
      supportsParallelCalls: true,
      async doEmbed({ values }: { values: string[] }) {
        return {
          embeddings: values.map((_, i) => [0.01 * (i + 1), 0.02, 0.03]),
          warnings: [],
        };
      },
    } as EmbeddingModel["model"],
    textBatchSize: 32,
  };
}

export function installTestMemoriesOntology(): void {
  installMemoriesOntology(minimalAgentMemoriesOntology);
}

export function resetTestMemoriesOntology(): void {
  resetMemoriesOntologyForTests();
}
