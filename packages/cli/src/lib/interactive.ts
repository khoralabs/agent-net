import type { FlagMap } from "../lib/argv.ts";
import { boolFlag } from "../lib/argv.ts";

/** Fail when prompts would be needed and non-interactive mode is set. */
export function requireNonInteractiveReady(flags: FlagMap, hint: string): void {
  if (boolFlag(flags, "yes", "y") || process.env.AGENT_NET_NO_INTERACTIVE === "1") {
    return;
  }
  throw new Error(
    `non-interactive required: ${hint} (pass -y and required flags, or set AGENT_NET_NO_INTERACTIVE=1)`,
  );
}
