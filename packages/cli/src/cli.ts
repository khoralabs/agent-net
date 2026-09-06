#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import path from "node:path";

function packageVersion(): string {
  const pkgPath = path.resolve(import.meta.dir, "../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export function printHelp(): void {
  console.log(`agent-net — headless CLI for @khoralabs/agent-net

Usage:
  agent-net <command> [flags]

Commands:
  help                 Show this help
  version              Print CLI version

Global flags:
  --help, -h           Show help
  --version, -V        Print version

Set AGENT_NET_NO_INTERACTIVE=1 to refuse prompts.
`);
}

export async function runCli(argv: string[]): Promise<number> {
  const [cmd] = argv;

  if (cmd === undefined || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return cmd === undefined ? 1 : 0;
  }

  if (cmd === "version" || cmd === "--version" || cmd === "-V") {
    console.log(packageVersion());
    return 0;
  }

  console.error(`Unknown command: ${argv.join(" ")}`);
  printHelp();
  return 1;
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
