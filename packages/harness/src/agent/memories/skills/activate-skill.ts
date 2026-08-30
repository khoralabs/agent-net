import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../../turn/tools/policies.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import {
  formatActivatedSkillContent,
  loadSkillByKey,
  resolveSkillStorageKey,
  type SkillRecord,
  upsertSkillInEnv,
} from "./_helpers/skills.ts";

export type ActivatedSkillContent = {
  name: string;
  alreadyActive: boolean;
  content?: string;
  namespace?: string;
  key?: string;
};

export async function activateSkillByName(
  env: HarnessToolkitEnv,
  name: string,
): Promise<ActivatedSkillContent> {
  const skillName = name.trim();
  if (skillName.length === 0) throw new Error("skill name is required");

  if (env.activatedSkillNames.has(skillName)) {
    return { name: skillName, alreadyActive: true };
  }

  let skill = env.skills.find((item) => item.name === skillName || item.key === skillName);
  if (skill === undefined && env.memoriesClient !== undefined) {
    const storageKey = resolveSkillStorageKey(env.skills, skillName);
    skill = await loadSkillByKey(env.memoriesClient, storageKey);
    if (skill !== undefined) {
      upsertSkillInEnv(env.skills, skill);
    }
  }
  if (skill === undefined) throw new Error(`skill not found: ${skillName}`);

  env.activatedSkillNames.add(skill.name);
  return {
    name: skill.name,
    alreadyActive: false,
    content: formatActivatedSkillContent(skill),
    namespace: skill.namespace,
    key: skill.key,
  };
}

export const activateSkillTool = tool<
  "activateSkill",
  { name: string },
  ActivatedSkillContent,
  HarnessToolkitEnv
>({
  name: "activateSkill",
  description:
    "Load full instructions for a skill by name. Skills are resolved from the agent's memories database under the _skills_ namespace.",
  instructions: ["Load specialized instructions from skills stored in the _skills_ namespace."],
  inputSchema: z.object({
    name: z.string().min(1).describe("Name or key of the skill to activate."),
  }),
  policies: [hasMemoriesClient, toolEnabled("activateSkill")],
  handler: async (ctx, input) => activateSkillByName(ctx.env, input.name),
});

export function skillNamesForEnv(skills: SkillRecord[]): string[] {
  return skills.map((skill) => skill.name);
}
