#!/usr/bin/env bun
import { dispatch } from "./commands/handlers.ts";
import { printVersion } from "./commands/version.ts";
import { boolFlag, parseArgv } from "./lib/argv.ts";
import { CommandExitError } from "./lib/errors.ts";
import { errorMessage } from "./lib/json-out.ts";

export function printHelp(): void {
  console.log(`agent-net — headless CLI for @khoralabs/agent-net

Usage:
  agent-net <command> [flags]

Commands:
  setup                Seed ~/.agent-net and write cli.config.json (-y)
  config show          Print resolved config
  config set           Patch config keys (-y)
  doctor               Check connectivity to khora/relay/memories/chat
  agent spawn          Spawn a custodial agent (optional --ontology, --external-id)
  agent list           List agent DIDs in dataDir
  agent get            Get agent summary (--did)
  agent remove         Remove agent (--did)
  inbox watch          Stream pool inbox events as NDJSON
  skills install       Install bundled agent-net-cli skill via bunx skills (-y)
  help                 Show this help
  version              Print CLI version

Global flags:
  --json               Machine-readable output
  --config <path>      Config file (else AGENT_NET_CONFIG or ~/.agent-net/cli.config.json)
  --data-dir <path>    Harness data directory
  --khora-url <url>    Khora base URL
  --relay-url <url>    Relay base URL
  --memories-url <url> Memories service URL
  --chat-url <url>     Chat service URL
  --help, -h           Show help
  --version, -V        Print version

Set AGENT_NET_NO_INTERACTIVE=1 to refuse prompts.
`);
}

export async function runCli(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    printHelp();
    return 1;
  }

  if (argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    return 0;
  }

  const { positional, flags } = parseArgv(argv);

  if (boolFlag(flags, "help", "h") && positional.length === 0) {
    printHelp();
    return 0;
  }

  if (
    (boolFlag(flags, "version", "V") && positional.length === 0) ||
    positional[0] === "--version" ||
    positional[0] === "-V"
  ) {
    printVersion(flags);
    return 0;
  }

  try {
    await dispatch(positional, flags);
    return 0;
  } catch (e) {
    if (e instanceof CommandExitError) {
      if (!e.alreadyPrinted) {
        if (boolFlag(flags, "json")) {
          console.log(JSON.stringify({ ok: false, error: e.message }));
        } else {
          console.error(e.message);
        }
      }
      return 1;
    }
    const msg = errorMessage(e);
    if (msg.startsWith("Unknown command:")) {
      console.error(msg);
      printHelp();
      return 1;
    }
    if (boolFlag(flags, "json")) {
      console.log(JSON.stringify({ ok: false, error: msg }));
    } else {
      console.error(msg);
    }
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
