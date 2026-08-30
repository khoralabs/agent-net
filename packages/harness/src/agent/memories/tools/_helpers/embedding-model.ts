import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-node/helpers";

const DEFAULT_EMBEDDING_MODEL = "google/gemini-embedding-2";

function parseEmbeddingPreset(): "L" | "M" | "H" {
  const raw = process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim().toUpperCase();
  if (raw === "L" || raw === "M" || raw === "H") return raw;
  return "M";
}

/** Google embedding models accept outputDimensionality via providerOptions. */
function isGoogleEmbeddingModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return id.startsWith("google/") || id.startsWith("gemini-embedding-");
}

/**
 * Resolve memories embedding via AI SDK gateway model id (same pattern as integrate-memories).
 * Returns undefined when `AI_GATEWAY_API_KEY` is unset so search can soft-fallback to lexical.
 */
export function resolveHarnessEmbeddingModel(): EmbeddingModel | undefined {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) return undefined;
  const modelId = process.env.MEMORIES_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  if (modelId.length === 0) return undefined;
  return createMemoriesEmbeddingModel({
    model: modelId,
    providerOptions: isGoogleEmbeddingModelId(modelId)
      ? mergeResolutionAndProviderOptions(parseEmbeddingPreset())
      : undefined,
  });
}
