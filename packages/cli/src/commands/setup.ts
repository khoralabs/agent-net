import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  configFromFlags,
  defaultConfigPath,
  defaultDataDir,
  resolveCliConfig,
} from "../config/load.ts";
import type { AgentNetCliConfig } from "../config/schema.ts";
import { writeCliConfigFile } from "../config/write.ts";
import type { FlagMap } from "../lib/argv.ts";
import { boolFlag, strFlag } from "../lib/argv.ts";
import { requireNonInteractiveReady } from "../lib/interactive.ts";
import { printJson } from "../lib/json-out.ts";

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

export async function handleSetup(flags: FlagMap): Promise<void> {
  requireNonInteractiveReady(
    flags,
    "setup needs -y with URLs/tokens (or env) to write ~/.agent-net/cli.config.json",
  );

  const { config } = resolveCliConfig(flags);
  const dataDir = expandHome(
    strFlag(flags, "data-dir")?.trim() || config.dataDir || defaultDataDir(),
  );
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(path.join(dataDir, "agents"), { recursive: true });

  const out: AgentNetCliConfig = {
    ...config,
    dataDir,
  };

  const configPath = strFlag(flags, "config")?.trim() || path.join(dataDir, "cli.config.json");
  writeCliConfigFile(configPath, out);

  let skill: unknown;
  if (boolFlag(flags, "install-skills") || boolFlag(flags, "skills")) {
    const { installBundledAgentNetCliSkill } = await import("./skills.ts");
    skill = installBundledAgentNetCliSkill({
      global: boolFlag(flags, "global", "g"),
      force: boolFlag(flags, "force", "f"),
      home: process.env.HOME ?? process.env.USERPROFILE ?? homedir(),
      cwd: process.cwd(),
    });
  }

  if (boolFlag(flags, "json")) {
    printJson({ ok: true, configPath, dataDir: out.dataDir, ...(skill ? { skill } : {}) });
    return;
  }
  console.log(`wrote ${configPath}`);
  console.log(`dataDir ${out.dataDir}`);
  if (skill !== undefined) {
    console.log(`skills: ${JSON.stringify(skill)}`);
  }
}

export async function handleConfigShow(flags: FlagMap): Promise<void> {
  const { config, configPath } = resolveCliConfig(flags);
  const showSecrets = boolFlag(flags, "show-secrets");
  const { redactConfig } = await import("../config/load.ts");
  const body = showSecrets ? config : redactConfig(config);
  if (boolFlag(flags, "json")) {
    printJson({ configPath, config: body });
    return;
  }
  console.log(`configPath: ${configPath ?? "(none)"}`);
  console.log(JSON.stringify(body, null, 2));
}

export async function handleConfigSet(flags: FlagMap): Promise<void> {
  requireNonInteractiveReady(flags, "config set requires -y");
  const patch = configFromFlags(flags);
  const { config, configPath } = resolveCliConfig(flags);
  const merged: AgentNetCliConfig = {
    ...config,
    ...patch,
    khora: { ...config.khora, ...patch.khora },
    relay: { ...config.relay, ...patch.relay },
    memories: { ...config.memories, ...patch.memories },
    chat: { ...config.chat, ...patch.chat },
  };
  const outPath = strFlag(flags, "config")?.trim() || configPath || defaultConfigPath();
  writeCliConfigFile(outPath, merged);
  if (boolFlag(flags, "json")) {
    printJson({ ok: true, configPath: outPath });
    return;
  }
  console.log(`wrote ${outPath}`);
}
