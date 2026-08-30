import type { HarnessToolkitEnv } from "../../../turn/tools/types.ts";
import { requireInstalledMemoriesOntology } from "./memories-ontology-install.ts";
import type { WriteMemoryNodeOptions } from "./memory-write.ts";

/** Resolve embedding + ontology (+ optional integrate enqueue) for writeMemoryNode. */
export function resolveWriteMemoryOptions(
  env: HarnessToolkitEnv,
  source: string,
): WriteMemoryNodeOptions {
  if (env.embeddingModel === undefined) {
    throw new Error(
      "embeddingModel is required for memory writes (set AI_GATEWAY_API_KEY; optional MEMORIES_EMBEDDING_MODEL)",
    );
  }
  const ontology = requireInstalledMemoriesOntology();

  const integrateCfg = env.integrateMemories;
  const ownerKey = env.agentDid?.trim();
  const integrate =
    integrateCfg !== undefined && ownerKey !== undefined && ownerKey.length > 0
      ? {
          baseUrl: integrateCfg.baseUrl,
          token: integrateCfg.token,
          ownerKey,
          writeScope: integrateCfg.writeScope ?? ("under" as const),
          source,
        }
      : undefined;

  return {
    embeddingModel: env.embeddingModel,
    ontology,
    ...(integrate !== undefined ? { integrate } : {}),
  };
}
