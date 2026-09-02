import { describe, expect, test } from "bun:test";

import {
  isIntegrateMemoryWriteScope,
  parseIntegrateMemoryWriteScope,
  resolveWriteNamespaceChoice,
  writeScopeNamespaceCandidates,
  writeScopeNeedsNamespaceChoice,
  writeScopeNeighborSearchOptions,
} from "./write-scope.ts";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

describe("parseIntegrateMemoryWriteScope", () => {
  test("accepts exact under cross", () => {
    expect(parseIntegrateMemoryWriteScope("exact")).toBe("exact");
    expect(parseIntegrateMemoryWriteScope("under")).toBe("under");
    expect(parseIntegrateMemoryWriteScope("cross")).toBe("cross");
  });

  test("rejects invalid values", () => {
    expect(() => parseIntegrateMemoryWriteScope("subtree")).toThrow(/writeScope/);
    expect(() => parseIntegrateMemoryWriteScope(1)).toThrow(/writeScope/);
    expect(isIntegrateMemoryWriteScope("cross")).toBe(true);
    expect(isIntegrateMemoryWriteScope("nope")).toBe(false);
  });
});

describe("writeScopeNeighborSearchOptions", () => {
  test("cross uses searchEntireDatabase", () => {
    expect(writeScopeNeighborSearchOptions("cross", "ns/a")).toEqual({
      namespace: "ns/a",
      searchEntireDatabase: true,
    });
  });

  test("under uses pathSubtree; exact/undefined keep seed namespace only", () => {
    expect(writeScopeNeighborSearchOptions("under", "ns/a")).toEqual({
      namespace: "ns/a",
      searchScopeMode: "pathSubtree",
    });
    expect(writeScopeNeighborSearchOptions("exact", "ns/a")).toEqual({
      namespace: "ns/a",
    });
    expect(writeScopeNeighborSearchOptions(undefined, "ns/a")).toEqual({
      namespace: "ns/a",
    });
  });
});

describe("writeScopeNamespaceCandidates", () => {
  const all = ["ns/a", "ns/a/child", "ns/b", "notes"];

  test("exact returns seed only", () => {
    expect(writeScopeNamespaceCandidates("exact", "ns/a", all)).toEqual(["ns/a"]);
    expect(writeScopeNeedsNamespaceChoice("exact")).toBe(false);
  });

  test("under returns seed and children", () => {
    expect(writeScopeNamespaceCandidates("under", "ns/a", all)).toEqual(["ns/a", "ns/a/child"]);
    expect(writeScopeNeedsNamespaceChoice("under")).toBe(true);
  });

  test("cross returns all namespaces sorted", () => {
    expect(writeScopeNamespaceCandidates("cross", "ns/a", all)).toEqual([
      "notes",
      "ns/a",
      "ns/a/child",
      "ns/b",
    ]);
    expect(writeScopeNeedsNamespaceChoice("cross")).toBe(true);
  });
});

describe("resolveWriteNamespaceChoice", () => {
  test("returns candidate match", () => {
    expect(
      resolveWriteNamespaceChoice({
        scope: "cross",
        seedNamespace: "ns/a",
        candidates: ["ns/a", "ns/b"],
        choice: "ns/b",
        slugifySegment: slugify,
      }),
    ).toBe("ns/b");
  });

  test("under allows one new child slug", () => {
    expect(
      resolveWriteNamespaceChoice({
        scope: "under",
        seedNamespace: "ns/a",
        candidates: ["ns/a"],
        choice: "ns/a/Notes!",
        slugifySegment: slugify,
      }),
    ).toBe("ns/a/notes");
  });

  test("cross rejects unknown and falls back to seed", () => {
    expect(
      resolveWriteNamespaceChoice({
        scope: "cross",
        seedNamespace: "ns/a",
        candidates: ["ns/a", "ns/b"],
        choice: "ns/a/new",
        slugifySegment: slugify,
      }),
    ).toBe("ns/a");
  });
});
