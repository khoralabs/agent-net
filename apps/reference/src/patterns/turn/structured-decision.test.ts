import { afterEach, describe, expect, test } from "bun:test";

import {
  engageDecisionSchema,
  inviteDecisionSchema,
  requireGatewayModelId,
} from "./structured-decision.ts";

describe("requireGatewayModelId", () => {
  const prevKey = process.env.AI_GATEWAY_API_KEY;
  const prevDefault = process.env.AGENT_DEFAULT_MODEL;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = prevKey;
    if (prevDefault === undefined) delete process.env.AGENT_DEFAULT_MODEL;
    else process.env.AGENT_DEFAULT_MODEL = prevDefault;
  });

  test("returns trimmed model id when gateway key set", () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    expect(requireGatewayModelId("  openai/gpt-4o  ")).toBe("openai/gpt-4o");
  });

  test("falls back to AGENT_DEFAULT_MODEL", () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    process.env.AGENT_DEFAULT_MODEL = "openai/gpt-4o-mini";
    expect(requireGatewayModelId("")).toBe("openai/gpt-4o-mini");
  });

  test("throws without model id", () => {
    process.env.AI_GATEWAY_API_KEY = "test-key";
    delete process.env.AGENT_DEFAULT_MODEL;
    expect(() => requireGatewayModelId("")).toThrow("model.id is required");
  });

  test("throws without AI_GATEWAY_API_KEY", () => {
    delete process.env.AI_GATEWAY_API_KEY;
    expect(() => requireGatewayModelId("openai/gpt-4o")).toThrow(
      "AI_GATEWAY_API_KEY environment variable not set",
    );
  });
});

describe("engageDecisionSchema", () => {
  test("accepts engage and skip", () => {
    expect(engageDecisionSchema.parse({ decision: "engage", reason: "fit" })).toEqual({
      decision: "engage",
      reason: "fit",
    });
    expect(engageDecisionSchema.parse({ decision: "skip", reason: "no stock" }).decision).toBe(
      "skip",
    );
  });

  test("rejects empty reason and unknown decision", () => {
    expect(() => engageDecisionSchema.parse({ decision: "engage", reason: "" })).toThrow();
    expect(() => engageDecisionSchema.parse({ decision: "maybe", reason: "x" })).toThrow();
  });
});

describe("inviteDecisionSchema", () => {
  test("accepts accept and decline", () => {
    expect(inviteDecisionSchema.parse({ decision: "accept", reason: "fit" })).toEqual({
      decision: "accept",
      reason: "fit",
    });
    expect(inviteDecisionSchema.parse({ decision: "decline", reason: "no fit" }).decision).toBe(
      "decline",
    );
  });

  test("rejects empty reason and unknown decision", () => {
    expect(() => inviteDecisionSchema.parse({ decision: "accept", reason: "" })).toThrow();
    expect(() => inviteDecisionSchema.parse({ decision: "engage", reason: "x" })).toThrow();
  });
});
