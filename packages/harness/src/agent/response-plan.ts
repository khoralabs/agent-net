import { z } from "zod";

export const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export const MAX_STEPS_OPTIONS = [2, 4, 8, 12, 16] as const;
export type MaxStepsOption = (typeof MAX_STEPS_OPTIONS)[number];

export type ResponsePlan = {
  reasoning?: ReasoningLevel;
  maxSteps?: MaxStepsOption;
  maxOutputTokens?: number | null;
  skillHints?: string[];
};

export type ResponsePlanOptions = {
  /** Classify + apply reasoning effort. Default true. */
  applyReasoning?: boolean;
  /** When true, classifier maxSteps overrides host/default. Default false. */
  applyMaxSteps?: boolean;
  /** When true, classifier maxOutputTokens is passed to streamText. Default false. */
  applyMaxOutputTokens?: boolean;
  /** When true, skillHints are pre-activated into system. Default false. */
  applySkillHints?: boolean;
};

export type ResolvedResponsePlanOptions = {
  applyReasoning: boolean;
  applyMaxSteps: boolean;
  applyMaxOutputTokens: boolean;
  applySkillHints: boolean;
};

export function resolveResponsePlanOptions(
  options?: ResponsePlanOptions,
): ResolvedResponsePlanOptions {
  return {
    applyReasoning: options?.applyReasoning ?? true,
    applyMaxSteps: options?.applyMaxSteps ?? false,
    applyMaxOutputTokens: options?.applyMaxOutputTokens ?? false,
    applySkillHints: options?.applySkillHints ?? false,
  };
}

/**
 * Parse `AGENT_RESPONSE_PLAN_APPLY` (comma list).
 * Default when unset/empty: `reasoning` only.
 */
export function responsePlanOptionsFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): ResolvedResponsePlanOptions {
  const raw = env.AGENT_RESPONSE_PLAN_APPLY?.trim();
  const parts =
    raw === undefined || raw.length === 0
      ? ["reasoning"]
      : raw
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
  const set = new Set(parts);
  return {
    applyReasoning: set.has("reasoning"),
    applyMaxSteps: set.has("maxSteps"),
    applyMaxOutputTokens: set.has("maxOutputTokens"),
    applySkillHints: set.has("skillHints"),
  };
}

export function buildResponsePlanSchema(
  options: ResolvedResponsePlanOptions,
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {};
  if (options.applyReasoning) {
    shape.reasoning = z.enum(REASONING_LEVELS);
  }
  if (options.applyMaxSteps) {
    shape.maxSteps = z.union([
      z.literal(2),
      z.literal(4),
      z.literal(8),
      z.literal(12),
      z.literal(16),
    ]);
  }
  if (options.applyMaxOutputTokens) {
    shape.maxOutputTokens = z.number().int().min(256).max(8192).nullable();
  }
  if (options.applySkillHints) {
    shape.skillHints = z.array(z.string().min(1)).max(3);
  }
  return z.object(shape);
}

export function anyResponsePlanKnobEnabled(options: ResolvedResponsePlanOptions): boolean {
  return (
    options.applyReasoning ||
    options.applyMaxSteps ||
    options.applyMaxOutputTokens ||
    options.applySkillHints
  );
}

export function clampMaxSteps(value: unknown): MaxStepsOption {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 8;
  let best: MaxStepsOption = 8;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const option of MAX_STEPS_OPTIONS) {
    const dist = Math.abs(option - n);
    if (dist < bestDist) {
      best = option;
      bestDist = dist;
    }
  }
  return best;
}

export function clampMaxOutputTokens(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(8192, Math.max(256, Math.round(n)));
}

export function normalizeSkillHints(value: unknown, catalogNames?: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (name.length === 0) continue;
    if (catalogNames !== undefined && catalogNames.size > 0) {
      const match = [...catalogNames].find((entry) => entry.toLowerCase() === name.toLowerCase());
      if (match === undefined) continue;
      if (!out.includes(match)) out.push(match);
    } else if (!out.includes(name)) {
      out.push(name);
    }
    if (out.length >= 3) break;
  }
  return out;
}

export function normalizeResponsePlan(
  raw: Record<string, unknown>,
  options: ResolvedResponsePlanOptions,
  catalogNames?: ReadonlySet<string>,
): ResponsePlan {
  const plan: ResponsePlan = {};
  if (options.applyReasoning) {
    const level = raw.reasoning;
    plan.reasoning =
      typeof level === "string" && (REASONING_LEVELS as readonly string[]).includes(level)
        ? (level as ReasoningLevel)
        : "none";
  }
  if (options.applyMaxSteps) {
    plan.maxSteps = clampMaxSteps(raw.maxSteps);
  }
  if (options.applyMaxOutputTokens) {
    plan.maxOutputTokens = clampMaxOutputTokens(raw.maxOutputTokens);
  }
  if (options.applySkillHints) {
    plan.skillHints = normalizeSkillHints(raw.skillHints, catalogNames);
  }
  return plan;
}

export function buildPlannerInstructions(options: ResolvedResponsePlanOptions): string[] {
  const lines: string[] = [
    "You are a lightweight response planner for an agent turn.",
    "Read the latest user message and emit a structured plan.",
    "Prefer the lowest sufficient settings; do not over-allocate.",
  ];
  if (options.applyReasoning) {
    lines.push(
      "reasoning: lowest sufficient effort (none|minimal|low|medium|high|xhigh).",
      "Prefer none/minimal for greetings, lookups, and short factual asks.",
      "Escalate only for multi-step analysis, math, coding, or careful judgment.",
    );
  }
  if (options.applyMaxSteps) {
    lines.push(
      "maxSteps: tool-loop budget. Use 2/4 for direct answers, 8 for typical tool use, 12/16 only for multi-tool research or edits.",
    );
  }
  if (options.applyMaxOutputTokens) {
    lines.push(
      "maxOutputTokens: soft ceiling on visible completion size (not thinking). Use null for provider default; smaller for terse replies, larger for long drafts.",
    );
  }
  if (options.applySkillHints) {
    lines.push(
      "skillHints: 0-3 skill names from the provided catalog that should be pre-loaded. Empty if none clearly apply. Use exact catalog names only.",
    );
  }
  return lines;
}

export function extractLatestUserText(
  messages: ReadonlyArray<{
    role: string;
    parts: Array<{ type: string } & Record<string, unknown>>;
  }>,
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message === undefined || message.role !== "user") continue;
    const text = message.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          part.type === "text" && typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
}

export function formatSkillCatalogForPlanner(
  skills: ReadonlyArray<{ name: string; description: string }>,
): string {
  if (skills.length === 0) return "";
  const entries = skills
    .map(
      (skill) =>
        `<skill><name>${skill.name}</name><description>${skill.description}</description></skill>`,
    )
    .join("\n");
  return `<available_skills>\n${entries}\n</available_skills>`;
}
