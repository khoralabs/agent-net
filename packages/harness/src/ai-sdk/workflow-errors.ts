import { FatalError, RetryableError } from "workflow";

import { isAbortError } from "../agent/turn/workflow-resilience.ts";

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
 * Otherwise rethrow `err`.
 */
export function rethrowAsFatalAiNoOutput(err: unknown, label = "AI step"): never {
  if (isNoOutputGeneratedError(err)) {
    throw new FatalError(`${label}: ${err.message}`);
  }
  throw err;
}
