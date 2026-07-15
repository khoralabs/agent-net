import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  mergeResolutionAndProviderOptions,
} from "@khoralabs/memories-core/helpers";

function parseEmbeddingPreset(): "L" | "M" | "H" {
  const raw = process.env.MEMORIES_SEARCH_EMBEDDING_PRESET?.trim().toUpperCase();
  if (raw === "L" || raw === "M" || raw === "H") return raw;
  return "M";
}

function resolveGeminiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    undefined
  );
}

export function resolveHarnessEmbeddingModel(): EmbeddingModel | undefined {
  const apiKey = resolveGeminiApiKey();
  if (apiKey === undefined || apiKey.length === 0) return undefined;
  const google = createGoogleGenerativeAI({ apiKey });
  return createMemoriesEmbeddingModel({
    model: google.embedding("gemini-embedding-2-preview"),
    providerOptions: mergeResolutionAndProviderOptions(parseEmbeddingPreset()),
  });
}
