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
