import { describe, expect, test } from "bun:test";

import { runCli } from "../cli.ts";

describe("dispatch agent flags", () => {
  test("agent get without --did fails", async () => {
    const code = await runCli([
      "agent",
      "get",
      "--json",
      "--chat-token",
      "t",
      "--memories-admin-token",
      "m",
    ]);
    expect(code).toBe(1);
  });

  test("agent remove without --did fails", async () => {
    const code = await runCli([
      "agent",
      "remove",
      "--json",
      "--chat-token",
      "t",
      "--memories-admin-token",
      "m",
    ]);
    expect(code).toBe(1);
  });
});
