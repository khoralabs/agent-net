import { readFileSync } from "node:fs";
import path from "node:path";

import type { FlagMap } from "../lib/argv.ts";
import { boolFlag } from "../lib/argv.ts";
import { printJson } from "../lib/json-out.ts";

export function packageVersion(): string {
  const pkgPath = path.resolve(import.meta.dir, "../../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export function printVersion(flags: FlagMap): void {
  const version = packageVersion();
  if (boolFlag(flags, "json")) {
    printJson({ version });
    return;
  }
  console.log(version);
}
