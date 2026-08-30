import { describe, expect, test } from "bun:test";
import { NoObjectGeneratedError } from "ai";
import { describeGenerationFailure, repairTruncatedJson } from "./structured-output.ts";

function repaired(text: string): unknown {
  const out = repairTruncatedJson(text);
  expect(out).not.toBeNull();
  return JSON.parse(out as string);
}

describe("repairTruncatedJson", () => {
  test("strips markdown fences", () => {
    expect(repaired('```json\n{"concepts": []}\n```')).toEqual({
      concepts: [],
    });
  });

  test("drops prose before the object", () => {
    expect(repaired('Here you go:\n{"a": 1}')).toEqual({ a: 1 });
  });

  test("ignores trailing text after a complete object", () => {
    expect(repaired('{"a": 1} — hope that helps')).toEqual({ a: 1 });
  });

  test("closes an array truncated between items", () => {
    expect(repaired('{"concepts": [{"slug": "a"}, {"slug": "b"}, {"slug":')).toEqual({
      concepts: [{ slug: "a" }, { slug: "b" }],
    });
  });

  test("closes an object truncated mid-string", () => {
    expect(repaired('{"concepts": [{"slug": "a", "plaintext": "half')).toEqual({
      concepts: [{ slug: "a" }],
    });
  });

  test("returns null when there is no JSON at all", () => {
    expect(repairTruncatedJson("I cannot help with that.")).toBeNull();
  });

  test("returns null when nothing complete can be salvaged", () => {
    expect(repairTruncatedJson('{"concepts": [{"slug"')).toBeNull();
  });
});

describe("describeGenerationFailure", () => {
  test("includes label, attempts, finish reason and output tail", () => {
    const message = describeGenerationFailure(
      "extractConcepts",
      2,
      new NoObjectGeneratedError({
        message: "could not parse the response",
        text: '{"concepts": [{"slug": "trunc',
        finishReason: "length",
        response: { id: "r1", timestamp: new Date(0), modelId: "test" },
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          inputTokenDetails: {
            noCacheTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 2, reasoningTokens: 0 },
        },
      }),
    );
    expect(message).toContain("extractConcepts");
    expect(message).toContain("2 attempt(s)");
    expect(message).toContain("finishReason=length");
    expect(message).toContain("trunc");
    expect(message).toContain("could not parse the response");
  });

  test("falls back to the raw error message", () => {
    expect(describeGenerationFailure("chooseWriteNamespace", 1, new Error("boom"))).toContain(
      "boom",
    );
  });
});
