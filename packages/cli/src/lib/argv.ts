export type FlagMap = Record<string, string | true>;

export type ParsedArgv = {
  positional: string[];
  flags: FlagMap;
};

const SHORT_FLAG_RE = /^-[A-Za-z]$/;

/** Flags that never take a value (boolean). */
const BOOLEAN_LONG_FLAGS = new Set([
  "json",
  "help",
  "version",
  "yes",
  "force",
  "global",
  "show-secrets",
]);

/**
 * argv parser:
 *   - `--flag` / `--flag=value` / `--flag value` — long flags
 *   - boolean long flags never consume the next token
 *   - `-x` — single-letter short flags (boolean only)
 *   - `--` — terminator
 */
export function parseArgv(argv: string[]): ParsedArgv {
  const positional: string[] = [];
  const flags: FlagMap = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      if (BOOLEAN_LONG_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (SHORT_FLAG_RE.test(a)) {
      flags[a.slice(1)] = true;
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

export function strFlag(flags: FlagMap, key: string): string | undefined {
  const v = flags[key];
  if (v === undefined || v === true) return undefined;
  return String(v);
}

export function boolFlag(flags: FlagMap, ...keys: string[]): boolean {
  for (const k of keys) {
    if (flags[k] === true) return true;
  }
  return false;
}
