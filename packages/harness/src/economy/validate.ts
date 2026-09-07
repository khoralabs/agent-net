import type { EconomyConfig } from "./types.ts";

function looksLikeCredentialKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("bearer") ||
    lower.includes("privatekey") ||
    lower.includes("private_key") ||
    lower.includes("apikey") ||
    lower.includes("api_key")
  ) {
    return true;
  }
  // Ends with token but not compute-budget fields like maxTokenBudget.
  if (lower.endsWith("token") && !lower.includes("budget")) {
    return true;
  }
  if (lower.includes("auth") && (lower.includes("token") || lower.includes("key"))) {
    return true;
  }
  return false;
}

function assertNoCredentialFields(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoCredentialFields(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (looksLikeCredentialKey(key)) {
      throw new Error(`EconomyConfig must not contain credential field ${path}.${key}`);
    }
    assertNoCredentialFields(child, `${path}.${key}`);
  }
}

export function validateEconomyConfig(config: EconomyConfig): void {
  if (config.sessionId.trim().length === 0) {
    throw new Error("sessionId is required");
  }
  if (config.dataDir.trim().length === 0) {
    throw new Error("dataDir is required");
  }
  if (config.actorCount < 2) {
    throw new Error("actorCount must be at least 2");
  }
  if (config.maxTokenBudget < 1) {
    throw new Error("maxTokenBudget must be at least 1");
  }
  if (config.maxRounds < 1) {
    throw new Error("maxRounds must be at least 1");
  }
  if (config.model.id.trim().length === 0) {
    throw new Error("model.id is required");
  }
  if (config.actorLabels !== undefined && config.actorLabels.length !== config.actorCount) {
    throw new Error(
      `actorLabels length (${config.actorLabels.length}) must equal actorCount (${config.actorCount})`,
    );
  }
  assertNoCredentialFields(config, "config");
}
