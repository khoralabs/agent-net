import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";

import {
  AGENT_MEMORY_DOMAIN,
  agentMemorySourceRef,
  isAgentMemorySourceRef,
  sourcesFromMemoryToolParts,
} from "./agent-memory-source.ts";

function toolPart(
  name: string,
  input: unknown,
  output: unknown,
  state = "output-available",
): UIMessage["parts"][number] {
  return {
    type: `tool-${name}`,
    toolCallId: `${name}-1`,
    state,
    input,
    output,
  } as UIMessage["parts"][number];
}

describe("agent-memory-source", () => {
  test("isAgentMemorySourceRef accepts locator shape", () => {
    const ref = agentMemorySourceRef({
      namespace: "agent/did/notes",
      memoryKey: "alpha",
    });
    expect(ref.domain).toBe(AGENT_MEMORY_DOMAIN);
    expect(isAgentMemorySourceRef(ref)).toBe(true);
    expect(isAgentMemorySourceRef({ domain: "other" })).toBe(false);
  });

  test("sourcesFromMemoryToolParts collects search / write / replace / read", () => {
    const parts = [
      toolPart(
        "searchMemories",
        { namespace: "agent/did", query: "hello" },
        {
          hits: [
            {
              namespace: "agent/did",
              memory_key: "a",
              kind: "node",
              source_key: "text",
              score: 1,
              labels: [],
            },
            {
              namespace: "agent/did",
              memory_key: "edge-1",
              kind: "edge",
              source_key: "text",
              score: 0.5,
              labels: [],
            },
          ],
        },
      ),
      toolPart(
        "writeMemory",
        { namespace: "agent/did", key: "b", text: "note" },
        { memoryIds: ["mem-b"] },
      ),
      toolPart(
        "replaceMemoryLines",
        { namespace: "agent/did", key: "c", changes: [] },
        {
          namespace: "agent/did",
          key: "c",
          memoryIds: ["mem-c"],
          lines: [],
        },
      ),
      toolPart(
        "readMemoryLines",
        { namespace: "agent/did", key: "a" },
        { namespace: "agent/did", key: "a", lines: [[1, "x"]] },
      ),
      toolPart("listNamespaces", {}, { namespaces: ["agent/did"] }),
      toolPart(
        "searchMemories",
        { namespace: "agent/did", query: "pending" },
        { hits: [] },
        "input-available",
      ),
    ] as UIMessage["parts"];

    const sources = sourcesFromMemoryToolParts(parts);
    const ids = sources.map((s) => s.id).sort();
    expect(ids).toContain("mem-b");
    expect(ids).toContain("mem-c");
    expect(sources.every((s) => isAgentMemorySourceRef(s.sourceRef))).toBe(true);
    expect(
      sources.some(
        (s) =>
          isAgentMemorySourceRef(s.sourceRef) &&
          s.sourceRef.memory_key === "a" &&
          s.sourceRef.source_key === "text",
      ),
    ).toBe(true);
    expect(
      sources.some(
        (s) => isAgentMemorySourceRef(s.sourceRef) && s.sourceRef.memory_key === "edge-1",
      ),
    ).toBe(false);
  });

  test("sourcesFromMemoryToolParts dedupes by memory_id", () => {
    const parts = [
      toolPart(
        "searchMemories",
        { namespace: "ns", query: "q" },
        {
          hits: [
            {
              namespace: "ns",
              memory_key: "k",
              kind: "node",
              source_key: "text",
              score: 1,
              labels: [],
            },
          ],
        },
      ),
      toolPart(
        "readMemoryLines",
        { namespace: "ns", key: "k" },
        { namespace: "ns", key: "k", lines: [] },
      ),
    ] as UIMessage["parts"];
    expect(sourcesFromMemoryToolParts(parts)).toHaveLength(1);
  });
});
