#!/usr/bin/env bun
/**
 * Install the bundled agent-net-cli skill via `bunx skills` (vercel-labs/skills).
 * Catalog shape: `<assets>/skills/agent-net-cli/SKILL.md`.
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

export const AGENTS_SKILLS_CANONICAL = path.join(".agents", "skills");
export const AGENT_NET_CLI_SKILL_NAME = "agent-net-cli";

export type AgentSkillInstallStatus = "copied" | "skipped_exists" | "overwritten";

export type AgentSkillInstallResult = {
  skillDir: string;
  status: AgentSkillInstallStatus;
  global: boolean;
};

export type SkillsCliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SkillsCliRunner = (
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv },
) => SkillsCliResult;

export function defaultSkillsCliRunner(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): SkillsCliResult {
  try {
    const result = Bun.spawnSync(["bunx", "skills", ...args], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 1, stdout: "", stderr: `failed to spawn bunx skills: ${message}` };
  }
}

export function resolveSkillsCatalogRoot(skillAssetsDir: string): string {
  const normalized = path.resolve(skillAssetsDir);
  if (
    path.basename(normalized) === AGENT_NET_CLI_SKILL_NAME &&
    path.basename(path.dirname(normalized)) === "skills"
  ) {
    return path.dirname(path.dirname(normalized));
  }
  const nested = path.join(normalized, "skills", AGENT_NET_CLI_SKILL_NAME);
  if (existsSync(path.join(nested, "SKILL.md"))) {
    return normalized;
  }
  throw new Error(
    `skill assets must live at <catalog>/skills/${AGENT_NET_CLI_SKILL_NAME} (got ${skillAssetsDir})`,
  );
}

export type InstallAgentNetCliSkillOptions = {
  skillAssetsDir: string;
  home?: string;
  cwd?: string;
  global?: boolean;
  force?: boolean;
  runSkillsCli?: SkillsCliRunner;
};

export function installAgentNetCliSkill(
  opts: InstallAgentNetCliSkillOptions,
): AgentSkillInstallResult {
  const catalogRoot = resolveSkillsCatalogRoot(opts.skillAssetsDir);
  const leaf = path.join(catalogRoot, "skills", AGENT_NET_CLI_SKILL_NAME);
  if (!existsSync(path.join(leaf, "SKILL.md"))) {
    throw new Error(`agent skill assets not found at ${leaf}`);
  }

  const isGlobal = opts.global === true;
  const home = opts.home?.trim() ?? "";
  if (isGlobal && home.length === 0) {
    throw new Error("HOME / USERPROFILE not set; cannot install global skills");
  }
  const rootBase = isGlobal ? home : (opts.cwd ?? process.cwd());
  const skillDir = path.join(rootBase, AGENTS_SKILLS_CANONICAL, AGENT_NET_CLI_SKILL_NAME);
  const force = opts.force === true;
  const run = opts.runSkillsCli ?? defaultSkillsCliRunner;

  if (existsSync(skillDir) && !force) {
    return { skillDir, status: "skipped_exists", global: isGlobal };
  }

  const status: AgentSkillInstallStatus = existsSync(skillDir) ? "overwritten" : "copied";
  const scopeFlags = isGlobal ? (["--global"] as const) : ([] as const);
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (isGlobal) {
    env.HOME = home;
    env.USERPROFILE = home;
  }

  if (force && existsSync(skillDir)) {
    const remove = run(["remove", AGENT_NET_CLI_SKILL_NAME, "-y", ...scopeFlags], {
      cwd: opts.cwd ?? process.cwd(),
      env,
    });
    if (remove.exitCode !== 0) {
      rmSync(skillDir, { recursive: true, force: true });
    }
  }

  const add = run(["add", catalogRoot, "--skill", AGENT_NET_CLI_SKILL_NAME, "-y", ...scopeFlags], {
    cwd: opts.cwd ?? process.cwd(),
    env,
  });
  if (add.exitCode !== 0) {
    throw new Error(
      `bunx skills add failed (${add.exitCode}): ${add.stderr.trim() || add.stdout.trim()}`,
    );
  }

  return { skillDir, status, global: isGlobal };
}
