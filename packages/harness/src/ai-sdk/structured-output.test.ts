import { afterEach, describe, expect, mock, test } from "bun:test";
import { NoObjectGeneratedError } from "ai";
import { FatalError, RetryableError } from "workflow";
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

describe("generateStructured", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns object on first successful generateObject", async () => {
    mock.module("ai", () => ({
      generateObject: async () => ({ object: { ok: true } }),
      NoObjectGeneratedError,
    }));
    const { generateStructured: gen } = (await import(
      `./structured-output.ts?t=${Date.now()}`
    )) as typeof import("./structured-output.ts");
    const result = await gen<{ ok: boolean }>({
      label: "test-ok",
      model: "test-model",
      schema: {},
      prompt: "hi",
      attempts: 1,
    });
    expect(result).toEqual({ ok: true });
  });

  test("retries on NoObjectGeneratedError then succeeds", async () => {
    let calls = 0;
    mock.module("ai", () => ({
      generateObject: async () => {
        calls += 1;
        if (calls === 1) {
          throw new NoObjectGeneratedError({
            message: "parse fail",
            text: "{",
            finishReason: "stop",
            response: { id: "r1", timestamp: new Date(0), modelId: "test" },
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              inputTokenDetails: {
                noCacheTokens: 1,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
            },
          });
        }
        return { object: { n: calls } };
      },
      NoObjectGeneratedError,
    }));
    const { generateStructured: gen } = (await import(
      `./structured-output.ts?t=${Date.now()}`
    )) as typeof import("./structured-output.ts");
    const result = await gen<{ n: number }>({
      label: "test-retry",
      model: "test-model",
      schema: {},
      prompt: "hi",
      attempts: 2,
    });
    expect(result).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  test("throws FatalError after exhausted NoObjectGeneratedError attempts", async () => {
    mock.module("ai", () => ({
      generateObject: async () => {
        throw new NoObjectGeneratedError({
          message: "still bad",
          text: "",
          finishReason: "stop",
          response: { id: "r1", timestamp: new Date(0), modelId: "test" },
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            inputTokenDetails: {
              noCacheTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
          },
        });
      },
      NoObjectGeneratedError,
    }));
    const { generateStructured: gen } = (await import(
      `./structured-output.ts?t=${Date.now()}`
    )) as typeof import("./structured-output.ts");
    await expect(
      gen({
        label: "test-fatal",
        model: "test-model",
        schema: {},
        prompt: "hi",
        attempts: 2,
      }),
    ).rejects.toBeInstanceOf(FatalError);
  });

  test("rethrows unexpected errors immediately", async () => {
    mock.module("ai", () => ({
      generateObject: async () => {
        throw new Error("network down");
      },
      NoObjectGeneratedError,
    }));
    const { generateStructured: gen } = (await import(
      `./structured-output.ts?t=${Date.now()}`
    )) as typeof import("./structured-output.ts");
    await expect(
      gen({
        label: "test-unexpected",
        model: "test-model",
        schema: {},
        prompt: "hi",
        attempts: 3,
      }),
    ).rejects.toThrow("network down");
  });

  test("maps abort errors to RetryableError", async () => {
    mock.module("ai", () => ({
      generateObject: async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      },
      NoObjectGeneratedError,
    }));
    const { generateStructured: gen } = (await import(
      `./structured-output.ts?t=${Date.now()}`
    )) as typeof import("./structured-output.ts");
    await expect(
      gen({
        label: "test-timeout",
        model: "test-model",
        schema: {},
        prompt: "hi",
        attempts: 1,
      }),
    ).rejects.toBeInstanceOf(RetryableError);
  });
});
