import { describe, expect, test } from "bun:test";

import { parseStopStackArgs } from "./stop-stack.ts";

describe("parseStopStackArgs", () => {
  test("defaults to reference ports", () => {
    expect(parseStopStackArgs([]).ports).toEqual([8788, 8790, 8791, 8792]);
  });

  test("--ports replaces defaults instead of merging", () => {
    expect(parseStopStackArgs(["--ports", "9000,9001"]).ports).toEqual([9000, 9001]);
  });
});
