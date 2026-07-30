import { describe, expect, test } from "bun:test";
import { formatMemoriesContextInstructions } from "./memories-context-instructions.ts";

describe("formatMemoriesContextInstructions", () => {
  test("uses generic copy when context is unset", () => {
    expect(formatMemoriesContextInstructions(undefined)).toEqual([
      "Persistent memory database for recalling and storing notes, observations, and context across turns.",
    ]);
  });

  test("renders about, base understanding, and grounding namespaces", () => {
    expect(
      formatMemoriesContextInstructions({
        about: "This database holds notes for the alpha research workspace.",
        baseUnderstanding: "Alpha tracks open questions and experiment logs.",
        groundingNamespaces: ["_root_/workspace/overview", "_root_/workspace/notes"],
      }),
    ).toEqual([
      "This database holds notes for the alpha research workspace.",
      "Base understanding:\nAlpha tracks open questions and experiment logs.",
      "Also provided: durable grounding under _root_/workspace/overview, _root_/workspace/notes — search there when needed.",
    ]);
  });
});
