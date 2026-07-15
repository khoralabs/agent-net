import { describe, expect, test } from "bun:test";

import { applyLineChanges, readLines } from "./line-editing.ts";

describe("line-editing", () => {
  test("readLines returns 1-based tuples including blank lines", () => {
    expect(readLines("a\n\nb")).toEqual([
      [1, "a"],
      [2, ""],
      [3, "b"],
    ]);
  });

  test("readLines normalizes CRLF", () => {
    expect(readLines("a\r\nb")).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });

  test("applyLineChanges replaces single and multiple lines", () => {
    const original = "one\ntwo\nthree";
    expect(applyLineChanges(original, [[2, "TWO"]])).toBe("one\nTWO\nthree");
    expect(
      applyLineChanges(original, [
        [1, "ONE"],
        [3, "THREE"],
      ]),
    ).toBe("ONE\ntwo\nTHREE");
  });

  test("applyLineChanges rejects out-of-range line numbers", () => {
    expect(() => applyLineChanges("a\nb", [[0, "x"]])).toThrow(/out of range/);
    expect(() => applyLineChanges("a\nb", [[3, "x"]])).toThrow(/out of range/);
  });

  test("applyLineChanges rejects duplicate line numbers", () => {
    expect(() =>
      applyLineChanges("a\nb", [
        [1, "x"],
        [1, "y"],
      ]),
    ).toThrow(/duplicate change/);
  });

  test("round-trip preserves content", () => {
    const text = "---\nname: demo\ndescription: Demo\n---\n\nBody line one.\nBody line two.";
    expect(applyLineChanges(text, readLines(text))).toBe(text);
  });
});
