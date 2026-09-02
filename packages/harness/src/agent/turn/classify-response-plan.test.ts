import { describe, expect, test } from "bun:test";
import {
  mergeResponsePlanIntoParams,
  runClassifyResponsePlan,
} from "../../ai-sdk/workflows/classify-response-plan-run.ts";
import type { ResponseModelCapabilities } from "./gateway-model-capabilities.ts";
import type { AgentWorkflowParams } from "./types.ts";

function baseParams(modelId: string): AgentWorkflowParams {
  return {
    runId: "run-classify",
    agent: {
      id: "network-harness-agent",
      name: "Network Harness Agent",
      actingFor: { type: "agent", id: "did:test" },
    },
    model: { id: modelId, maxSteps: 8 },
    context: {
      threadId: "t1",
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
    },
    output: { chat: { threadId: "t1", streamDeltas: false } },
  };
}

function caps(supportsReasoning: boolean, modelId = "test/model"): ResponseModelCapabilities {
  return {
    modelId,
    supportsReasoning,
    maxOutputTokens: null,
    unknown: false,
  };
}

describe("runClassifyResponsePlan", () => {
  test("skips LLM when only reasoning and model is incapable", async () => {
    let called = false;
    const result = await runClassifyResponsePlan({
      params: baseParams("acme/fast-chat"),
      capabilities: caps(false, "acme/fast-chat"),
      options: { applyReasoning: true },
      generateTextFn: (async () => {
        called = true;
        return { output: { reasoning: "high" } };
      }) as never,
    });
    expect(called).toBe(false);
    expect(result.skippedLlm).toBe(true);
    expect(result.plan).toEqual({ reasoning: "none" });
  });

  test("calls LLM and returns plan when model supports reasoning", async () => {
    if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
      process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    }
    let called = false;
    const result = await runClassifyResponsePlan({
      params: baseParams("zai/glm-5.2-fast"),
      capabilities: caps(true, "zai/glm-5.2-fast"),
      options: { applyReasoning: true },
      generateTextFn: (async () => {
        called = true;
        return { output: { reasoning: "minimal" } };
      }) as never,
    });
    expect(called).toBe(true);
    expect(result.skippedLlm).toBe(false);
    expect(result.plan.reasoning).toBe("minimal");

    const merged = mergeResponsePlanIntoParams(
      baseParams("zai/glm-5.2-fast"),
      result.plan,
      result.options,
    );
    expect(merged.model.reasoning).toBe("minimal");
    expect(merged.model.maxSteps).toBe(8);
  });
});
