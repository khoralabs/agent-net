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
      "Use writeSkill to author skills in the skills namespace (alias for a structured memory write).",
      "Use readSkillLines to inspect an existing skill as numbered lines before editing it.",
      "Use replaceSkillLines to refine a skill by replacing specific line numbers.",
      "Prefer line edits over full writeSkill rewrites for skill refinements.",
      "Use activateSkill to load specialized instructions from skills stored in the skills namespace.",
    ],
  },
);
