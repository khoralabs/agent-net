import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli } from "./cli.ts";
import { resolveCliConfig } from "./config/load.ts";
import { parseArgv } from "./lib/argv.ts";

describe("parseArgv", () => {
  test("parses long flags and positionals", () => {
    const { positional, flags } = parseArgv([
      "config",
      "show",
      "--json",
      "--khora-url",
      "http://x",
    ]);
    expect(positional).toEqual(["config", "show"]);
    expect(flags.json).toBe(true);
    expect(flags["khora-url"]).toBe("http://x");
  });

  test("boolean --json does not consume the next command token", () => {
    const { positional, flags } = parseArgv(["--json", "config", "show"]);
    expect(positional).toEqual(["config", "show"]);
    expect(flags.json).toBe(true);
  });
});

describe("resolveCliConfig", () => {
  test("flags override env defaults", () => {
    const { config } = resolveCliConfig(
      { "khora-url": "http://khora.test", "chat-token": "tok", "memories-admin-token": "adm" },
      {},
    );
    expect(config.khora.baseUrl).toBe("http://khora.test");
    expect(config.chat.token).toBe("tok");
    expect(config.memories.adminToken).toBe("adm");
  });
});

describe("agent-net-cli config commands", () => {
  test("setup -y writes config", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agent-net-cli-"));
    const configPath = path.join(dir, "cli.config.json");
    const code = await runCli([
      "setup",
      "-y",
      "--config",
      configPath,
      "--data-dir",
      dir,
      "--chat-token",
      "t",
      "--memories-admin-token",
      "m",
    ]);
    expect(code).toBe(0);
    const written = JSON.parse(readFileSync(configPath, "utf8")) as { chat: { token: string } };
    expect(written.chat.token).toBe("t");
  });

  test("config show --json", async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const code = await runCli([
        "config",
        "show",
        "--json",
        "--chat-token",
        "x",
        "--memories-admin-token",
        "y",
      ]);
      expect(code).toBe(0);
      const parsed = JSON.parse(logs.join("\n")) as { config: { chat: { token: string } } };
      expect(parsed.config.chat.token).toBe("***");
    } finally {
      console.log = original;
    }
  });
});
