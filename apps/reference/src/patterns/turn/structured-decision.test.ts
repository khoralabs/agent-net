import { describe, expect, test } from "bun:test";

import { engageDecisionSchema, inviteDecisionSchema } from "./structured-decision.ts";

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
