import { describe, expect, test } from "bun:test";

import { printHelp, runCli } from "./cli.ts";

describe("agent-net-cli scaffold", () => {
  test("version prints package.json version", async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const code = await runCli(["version"]);
      expect(code).toBe(0);
      expect(logs.join("\n")).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      console.log = original;
    }
  });

  test("help exits 0", async () => {
    const original = console.log;
    console.log = () => {};
    try {
      expect(await runCli(["help"])).toBe(0);
    } finally {
      console.log = original;
    }
  });

  test("unknown command exits 1", async () => {
    const originalLog = console.log;
    const originalErr = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      expect(await runCli(["nope"])).toBe(1);
    } finally {
      console.log = originalLog;
      console.error = originalErr;
    }
  });

  test("printHelp mentions agent-net", () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      printHelp();
      expect(logs.join("\n")).toContain("agent-net");
      expect(logs.join("\n")).not.toContain("--json");
    } finally {
      console.log = original;
    }
  });
});
