import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import {
  formatActivatedSkillContent,
  loadSkillByKey,
  type SkillRecord,
} from "./_helpers/skills.ts";

export type ActivatedSkillContent = {
  name: string;
  alreadyActive: boolean;
  content?: string;
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
    skill = await loadSkillByKey(env.memoriesClient, skillName);
    if (skill !== undefined) {
      env.skills.push(skill);
    }
  }
  if (skill === undefined) throw new Error(`skill not found: ${skillName}`);

  env.activatedSkillNames.add(skill.name);
  return {
    name: skill.name,
    alreadyActive: false,
    content: formatActivatedSkillContent(skill),
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
    "Load full instructions for a skill by name. Skills are resolved from the agent's memories database under the skills namespace.",
  instructions: ["Load specialized instructions from skills stored in the skills namespace."],
  inputSchema: z.object({
    name: z.string().min(1).describe("Name or key of the skill to activate."),
  }),
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => activateSkillByName(ctx.env, input.name),
});

export function skillNamesForEnv(skills: SkillRecord[]): string[] {
  return skills.map((skill) => skill.name);
}
