import { describe, expect, test } from "bun:test";
import { mergeResponsePlanIntoParams } from "../../ai-sdk/workflows/classify-response-plan-run.ts";
import {
  buildResponsePlanSchema,
  clampMaxOutputTokens,
  clampMaxSteps,
  extractLatestUserText,
  normalizeResponsePlan,
  normalizeSkillHints,
  resolveResponsePlanOptions,
  responsePlanOptionsFromEnv,
} from "./response-plan.ts";
import type { AgentWorkflowParams } from "./types.ts";

describe("responsePlanOptionsFromEnv", () => {
  test("defaults to reasoning only", () => {
    expect(responsePlanOptionsFromEnv({})).toEqual({
      applyReasoning: true,
      applyMaxSteps: false,
      applyMaxOutputTokens: false,
      applySkillHints: false,
    });
  });

  test("parses comma list", () => {
    expect(
      responsePlanOptionsFromEnv({
        AGENT_RESPONSE_PLAN_APPLY: "reasoning,maxSteps,skillHints",
      }),
    ).toEqual({
      applyReasoning: true,
      applyMaxSteps: true,
      applyMaxOutputTokens: false,
      applySkillHints: true,
    });
  });
});

describe("buildResponsePlanSchema", () => {
  test("omits disabled keys", () => {
    const schema = buildResponsePlanSchema(resolveResponsePlanOptions({ applyReasoning: true }));
    const parsed = schema.safeParse({ reasoning: "low", maxSteps: 8 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ reasoning: "low" });
    }
  });

  test("includes enabled keys", () => {
    const schema = buildResponsePlanSchema(
      resolveResponsePlanOptions({
        applyReasoning: true,
        applyMaxSteps: true,
        applyMaxOutputTokens: true,
        applySkillHints: true,
      }),
    );
    const parsed = schema.safeParse({
      reasoning: "medium",
      maxSteps: 12,
      maxOutputTokens: 1024,
      skillHints: ["A"],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("normalize / clamp", () => {
  test("clampMaxSteps picks nearest allowed", () => {
    expect(clampMaxSteps(3)).toBe(2);
    expect(clampMaxSteps(5)).toBe(4);
    expect(clampMaxSteps(9)).toBe(8);
    expect(clampMaxSteps(100)).toBe(16);
  });

  test("clampMaxOutputTokens bounds", () => {
    expect(clampMaxOutputTokens(null)).toBe(null);
    expect(clampMaxOutputTokens(10)).toBe(256);
    expect(clampMaxOutputTokens(9000)).toBe(8192);
    expect(clampMaxOutputTokens(1024)).toBe(1024);
  });

  test("normalizeSkillHints filters unknown and caps at 3", () => {
    const catalog = new Set(["Summarize", "Draft"]);
    expect(normalizeSkillHints(["summarize", "missing", "Draft", "extra", "x"], catalog)).toEqual([
      "Summarize",
      "Draft",
    ]);
  });

  test("normalizeResponsePlan respects options", () => {
    const plan = normalizeResponsePlan(
      {
        reasoning: "high",
        maxSteps: 12,
        maxOutputTokens: 2048,
        skillHints: ["A"],
      },
      resolveResponsePlanOptions({ applyReasoning: true }),
    );
    expect(plan).toEqual({ reasoning: "high" });
  });
});

describe("extractLatestUserText", () => {
  test("returns latest user text part", () => {
    expect(
      extractLatestUserText([
        { role: "user", parts: [{ type: "text", text: "first" }] },
        { role: "assistant", parts: [{ type: "text", text: "reply" }] },
        { role: "user", parts: [{ type: "text", text: "second" }] },
      ]),
    ).toBe("second");
  });
});

describe("mergeResponsePlanIntoParams", () => {
  const base: AgentWorkflowParams = {
    runId: "run-1",
    agent: {
      id: "network-harness-agent",
      name: "Network Harness Agent",
      actingFor: { type: "agent", id: "did:test" },
    },
    model: { id: "zai/glm-5.2-fast", maxSteps: 8 },
    context: {
      threadId: "t1",
      messages: [],
    },
    output: { chat: { threadId: "t1", streamDeltas: false } },
  };

  test("default options only merge reasoning", () => {
    const options = resolveResponsePlanOptions({ applyReasoning: true });
    const next = mergeResponsePlanIntoParams(
      base,
      {
        reasoning: "low",
        maxSteps: 16,
        maxOutputTokens: 1024,
        skillHints: ["Summarize"],
      },
      options,
    );
    expect(next.model.reasoning).toBe("low");
    expect(next.model.maxSteps).toBe(8);
    expect(next.model.maxOutputTokens).toBeUndefined();
    expect(next.responsePlan).toBeUndefined();
  });

  test("enabled flags merge all knobs", () => {
    const options = resolveResponsePlanOptions({
      applyReasoning: true,
      applyMaxSteps: true,
      applyMaxOutputTokens: true,
      applySkillHints: true,
    });
    const next = mergeResponsePlanIntoParams(
      base,
      {
        reasoning: "medium",
        maxSteps: 12,
        maxOutputTokens: 2048,
        skillHints: ["Summarize"],
      },
      options,
    );
    expect(next.model).toMatchObject({
      reasoning: "medium",
      maxSteps: 12,
      maxOutputTokens: 2048,
    });
    expect(next.responsePlan).toEqual({ skillHints: ["Summarize"] });
  });
});
