import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import {
  minimalAgentMemoriesOntology,
  resolveAgentMemoriesOntology,
} from "@khoralabs/memories-service/client/agent";
import { toolkitEnabled } from "../../turn/tools/_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "../../turn/tools/ids.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import { getInstalledMemoriesOntology } from "../tools/_helpers/memories-ontology-install.ts";
import { activateSkillTool } from "./activate-skill.ts";
import { hasSkillsNamespace } from "./policies.ts";
import { replaceSkillLinesTool } from "./replace-skill-lines.ts";
import { resolveSkillsTool } from "./resolve-skills.ts";
import { searchSkillsTool } from "./search-skills.ts";
import { createWriteSkillTool } from "./write-skill.ts";

function resolveToolkitOntology() {
  const installed = getInstalledMemoriesOntology();
  if (installed !== undefined) {
    return resolveAgentMemoriesOntology(installed);
  }
  return minimalAgentMemoriesOntology;
}

export const skillsToolkit = dynamicToolkit<"skills", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.skills,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.skills), hasSkillsNamespace],
  create: async () => {
    const writeSkillTool = createWriteSkillTool(resolveToolkitOntology());
    return [
      toolkit(
        [
          searchSkillsTool,
          writeSkillTool,
          resolveSkillsTool,
          replaceSkillLinesTool,
          activateSkillTool,
        ],
        {
          name: "skills-core",
          instructions: [
            "Author, search, refine, and activate specialized skills stored in the _skills_ memory namespace.",
          ],
        },
      ),
    ];
  },
});
