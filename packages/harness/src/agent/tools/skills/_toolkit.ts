import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import { toolkitEnabled } from "../_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "../ids.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { activateSkillTool } from "./activate-skill.ts";
import { readSkillLinesTool } from "./read-skill-lines.ts";
import { replaceSkillLinesTool } from "./replace-skill-lines.ts";
import { writeSkillTool } from "./write-skill.ts";

const skillsCore = toolkit(
  [writeSkillTool, readSkillLinesTool, replaceSkillLinesTool, activateSkillTool],
  {
    name: "skills-core",
    instructions: [
      "Author, refine, and activate specialized skills stored in the _root_/_skills_ memory namespace.",
    ],
  },
);

export const skillsToolkit = dynamicToolkit<"skills", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.skills,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.skills)],
  create: async () => [skillsCore],
});
