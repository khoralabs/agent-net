import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { installAgentNetCliSkill, resolveSkillsCatalogRoot } from "./install-agent-skill.ts";

describe("install-agent-skill", () => {
  test("resolveSkillsCatalogRoot from leaf", () => {
    const root = mkdtempSync(path.join(tmpdir(), "skills-cat-"));
    const leaf = path.join(root, "skills", "agent-net-cli");
    mkdirSync(leaf, { recursive: true });
    writeFileSync(path.join(leaf, "SKILL.md"), "# x\n");
    expect(resolveSkillsCatalogRoot(leaf)).toBe(root);
  });

  test("install invokes bunx skills add with expected args", () => {
    const root = mkdtempSync(path.join(tmpdir(), "skills-cat-"));
    const leaf = path.join(root, "skills", "agent-net-cli");
    mkdirSync(leaf, { recursive: true });
    writeFileSync(path.join(leaf, "SKILL.md"), "# x\n");
    const cwd = mkdtempSync(path.join(tmpdir(), "skills-cwd-"));
    const calls: string[][] = [];
    const result = installAgentNetCliSkill({
      skillAssetsDir: leaf,
      cwd,
      force: false,
      runSkillsCli: (args) => {
        calls.push(args);
        mkdirSync(path.join(cwd, ".agents", "skills", "agent-net-cli"), { recursive: true });
        writeFileSync(path.join(cwd, ".agents", "skills", "agent-net-cli", "SKILL.md"), "# x\n");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });
    expect(result.status).toBe("copied");
    expect(calls[0]).toEqual(["add", root, "--skill", "agent-net-cli", "-y"]);
  });
});
