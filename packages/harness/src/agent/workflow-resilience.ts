import { NoOutputGeneratedError } from "ai";
import { FatalError } from "workflow";

/** Durable AI-step retries (3 total attempts including the first). */
export const AI_STEP_MAX_RETRIES = 2;

/** Wall-clock budget for agent-response tool-loop steps. */
export const AGENT_STEP_TIMEOUT_MS = 180_000;

/**
 * If `err` is {@link NoOutputGeneratedError}, throw {@link FatalError}.
 * Otherwise rethrow `err`.
 */
export function rethrowAsFatalAiNoOutput(err: unknown, label = "AI step"): never {
  if (NoOutputGeneratedError.isInstance(err)) {
    throw new FatalError(`${label}: ${err.message}`);
  }
  throw err;
}
