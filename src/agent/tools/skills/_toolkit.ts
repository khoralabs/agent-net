import { toolkit } from "@khoralabs/agent-capabilities";

import { activateSkillTool } from "./activate-skill.ts";
import { readSkillLinesTool } from "./read-skill-lines.ts";
import { replaceSkillLinesTool } from "./replace-skill-lines.ts";
import { writeSkillTool } from "./write-skill.ts";

export const skillsToolkit = toolkit(
  [writeSkillTool, readSkillLinesTool, replaceSkillLinesTool, activateSkillTool],
  {
    name: "skills",
    instructions: [
      "Author, refine, and activate specialized skills stored in the skills memory namespace.",
    ],
  },
);
