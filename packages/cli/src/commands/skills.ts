import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  AGENT_NET_CLI_SKILL_NAME,
  type AgentSkillInstallResult,
  installAgentNetCliSkill,
} from "../../scripts/install-agent-skill.ts";
import type { FlagMap } from "../lib/argv.ts";
import { boolFlag } from "../lib/argv.ts";
import { requireNonInteractiveReady } from "../lib/interactive.ts";
import { printJson } from "../lib/json-out.ts";

const ASSETS_DIR_ENV = "AGENT_NET_CLI_ASSETS_DIR";

export function resolveSkillAssetsDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[ASSETS_DIR_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return path.join(fromEnv, "skills", AGENT_NET_CLI_SKILL_NAME);
  }
  const pkgRoot = path.resolve(import.meta.dir, "../..");
  return path.join(pkgRoot, "assets", "skills", AGENT_NET_CLI_SKILL_NAME);
}

export function installBundledAgentNetCliSkill(opts: {
  global: boolean;
  force: boolean;
  home?: string;
  cwd?: string;
}): AgentSkillInstallResult {
  const skillAssetsDir = resolveSkillAssetsDir();
  if (!existsSync(skillAssetsDir)) {
    throw new Error(`skills install: skill assets not found at ${skillAssetsDir}`);
  }
  return installAgentNetCliSkill({
    skillAssetsDir,
    home: opts.home,
    cwd: opts.cwd,
    global: opts.global,
    force: opts.force,
  });
}

export async function handleSkillsInstall(flags: FlagMap): Promise<void> {
  requireNonInteractiveReady(flags, "skills install requires -y");
  const force = boolFlag(flags, "force", "f");
  const global = boolFlag(flags, "global", "g");
  const result = installBundledAgentNetCliSkill({
    global,
    force,
    home: process.env.HOME ?? process.env.USERPROFILE ?? homedir(),
    cwd: process.cwd(),
  });
  if (boolFlag(flags, "json")) {
    printJson(result);
    return;
  }
  console.log(`${result.status} ${AGENT_NET_CLI_SKILL_NAME} at ${result.skillDir}`);
}
