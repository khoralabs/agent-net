import {
  type FlexibleSchema,
  generateObject,
  type LanguageModel,
  NoObjectGeneratedError,
} from "ai";
import { FatalError } from "workflow";

import {
  AI_STEP_TIMEOUT_MS,
  isAbortError,
  rethrowAsRetryableTimeout,
} from "./workflow-resilience.ts";

const DEFAULT_ATTEMPTS = 2;
/** Gemini counts thinking tokens against the output budget; leave headroom. */
const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;
const OUTPUT_TAIL_CHARS = 600;

/**
 * Salvage the common truncation shapes: fenced JSON and a response cut off
 * mid-array/mid-object. Returns null when nothing parseable can be recovered.
 */
export function repairTruncatedJson(text: string): string | null {
  let body = text.trim();
  if (body.startsWith("```")) {
    body = body.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  body = body.slice(start).trim();

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastComplete = -1;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      continue;
    }
    if (ch === "}" || ch === "]") {
      if (stack.pop() === undefined) return null;
      if (stack.length === 0) lastComplete = i;
    }
  }

  if (stack.length === 0) {
    return lastComplete >= 0 ? body.slice(0, lastComplete + 1) : null;
  }

  let tail = body;
  if (inString) {
    const lastQuote = tail.lastIndexOf('"');
    if (lastQuote < 0) return null;
    tail = tail.slice(0, lastQuote);
  }
  const lastBoundary = Math.max(
    tail.lastIndexOf("}"),
    tail.lastIndexOf("]"),
    tail.lastIndexOf(","),
  );
  if (lastBoundary < 0) return null;
  tail = tail.slice(0, lastBoundary + 1).replace(/,\s*$/, "");

  const closers: string[] = [];
  const open: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < tail.length; i++) {
    const ch = tail[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") open.push("}");
    else if (ch === "[") open.push("]");
    else if (ch === "}" || ch === "]") open.pop();
  }
  while (open.length > 0) {
    const closer = open.pop();
    if (closer !== undefined) closers.push(closer);
  }
  return `${tail}${closers.join("")}`;
}

/** Diagnosable message for a generation that never produced a valid object. */
export function describeGenerationFailure(label: string, attempts: number, error: unknown): string {
  const parts = [`${label}: no valid object after ${attempts} attempt(s)`];
  if (NoObjectGeneratedError.isInstance(error)) {
    if (error.finishReason !== undefined) {
      parts.push(`finishReason=${error.finishReason}`);
    }
    const text = error.text ?? "";
    if (text.length > 0) {
      parts.push(`outputTail=${JSON.stringify(text.slice(-OUTPUT_TAIL_CHARS))}`);
    }
  }
  parts.push(error instanceof Error ? error.message : String(error));
  return parts.join(" | ");
}

function retryHint(error: unknown): string {
  const lines = ["The previous response could not be parsed into the required schema."];
  if (NoObjectGeneratedError.isInstance(error)) {
    if (error.finishReason === "length") {
      lines.push(
        "It was cut off by the output limit — return substantially fewer items this time.",
      );
    }
    lines.push(`Parser error: ${error.message}`);
  }
  lines.push("Return only JSON matching the schema, with no prose or fences.");
  return lines.join("\n");
}

/**
 * Structured generation with a bounded number of in-step attempts.
 * Shared by integrate chooseNS/extract and other non-chat harness steps.
 */
export async function generateStructured<T>(args: {
  label: string;
  model: LanguageModel;
  schema: unknown;
  prompt: string;
  attempts?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
}): Promise<T> {
  const attempts = Math.max(1, args.attempts ?? DEFAULT_ATTEMPTS);
  let lastError: unknown;
  let hint = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { object } = await generateObject({
        model: args.model,
        schema: args.schema as FlexibleSchema<T>,
        prompt: hint.length === 0 ? args.prompt : `${args.prompt}\n\n${hint}`,
        maxOutputTokens: args.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(args.timeoutMs ?? AI_STEP_TIMEOUT_MS),
        experimental_repairText: async ({ text }: { text: string }) => repairTruncatedJson(text),
      });
      return object as T;
    } catch (error) {
      if (isAbortError(error)) {
        rethrowAsRetryableTimeout(error, args.label);
      }
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      lastError = error;
      hint = retryHint(error);
    }
  }

  throw new FatalError(describeGenerationFailure(args.label, attempts, lastError));
}
