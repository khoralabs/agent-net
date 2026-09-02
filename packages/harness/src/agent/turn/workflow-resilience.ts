import { FatalError, RetryableError } from "workflow";

/** Durable AI-step retries (3 total attempts including the first). */
export const AI_STEP_MAX_RETRIES = 2;

/** Wall-clock budget for adapter / structured AI steps. */
export const AI_STEP_TIMEOUT_MS = 90_000;

/** Wall-clock budget for agent-response tool-loop steps. */
export const AGENT_STEP_TIMEOUT_MS = 180_000;

export function isAbortError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  if (name === "AbortError" || name === "TimeoutError" || name === "AgentSessionAbortedError") {
    return true;
  }
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string" && message === "Agent session aborted") {
    return true;
  }
  return false;
}

/** If `err` is an abort/timeout, throw {@link RetryableError}; else rethrow. */
export function rethrowAsRetryableTimeout(err: unknown, label: string): never {
  if (isAbortError(err)) {
    const detail = err instanceof Error && err.message.length > 0 ? err.message : "aborted";
    throw new RetryableError(`${label} timed out: ${detail}`);
  }
  throw err;
}

function isNoOutputGeneratedError(err: unknown): err is Error {
  return (
    err !== null &&
    typeof err === "object" &&
    typeof (err as { name?: unknown }).name === "string" &&
    ((err as { name: string }).name === "AI_NoOutputGeneratedError" ||
      (err as { name: string }).name === "NoOutputGeneratedError")
  );
}

/**
 * If `err` looks like AI SDK {@code NoOutputGeneratedError}, throw {@link FatalError}.
 * Otherwise rethrow `err`. Duck-typed so core stays free of `ai` imports.
 */
export function rethrowAsFatalAiNoOutput(err: unknown, label = "AI step"): never {
  if (isNoOutputGeneratedError(err)) {
    throw new FatalError(`${label}: ${err.message}`);
  }
  throw err;
}
