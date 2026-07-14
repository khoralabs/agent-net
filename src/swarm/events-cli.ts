import path from "node:path";

import { listNetworkEvents } from "../observability/network-log.ts";
import { resolveHarnessDataDir } from "../workflow/paths.ts";

function parseArgs(argv: string[]): {
  dataDir: string;
  sessionId?: string;
  agentDid?: string;
  kind?: string;
  sinceSeq?: number;
} {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      args.set(key, value);
      i++;
    } else {
      args.set(key, "true");
    }
  }

  const sinceSeqRaw = args.get("since-seq");
  return {
    dataDir: resolveHarnessDataDir(args.get("data-dir")),
    sessionId: args.get("session-id")?.trim(),
    agentDid: args.get("agent-did")?.trim(),
    kind: args.get("kind")?.trim(),
    sinceSeq: sinceSeqRaw !== undefined ? Number.parseInt(sinceSeqRaw, 10) : undefined,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.sessionId === undefined || opts.sessionId.length === 0) {
    throw new Error("--session-id is required");
  }

  const events = await listNetworkEvents(opts.dataDir, opts.sessionId, {
    agentDid: opts.agentDid,
    kind: opts.kind,
    sinceSeq: opts.sinceSeq,
  });

  for (const event of events) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }

  if (events.length === 0) {
    process.stderr.write(
      `No events found for session ${opts.sessionId} in ${path.resolve(opts.dataDir)}\n`,
    );
  }
}

await main();
