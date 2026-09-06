import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { AgentNetCliConfig, AgentNetCliConfigPartial } from "./schema.ts";

export function writeCliConfigFile(
  filePath: string,
  config: AgentNetCliConfig | AgentNetCliConfigPartial,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
