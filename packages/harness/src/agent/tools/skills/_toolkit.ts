import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import { toolkitEnabled } from "../_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "../ids.ts";
import { resolveHarnessMemoriesOntology } from "../memories/_helpers/memories-client.ts";
import { getInstalledMemoriesOntology } from "../memories/_helpers/memories-ontology-install.ts";
import { minimalHarnessMemoriesOntology } from "../memories/_helpers/minimal-ontology.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { activateSkillTool } from "./activate-skill.ts";
import { replaceSkillLinesTool } from "./replace-skill-lines.ts";
import { resolveSkillsTool } from "./resolve-skills.ts";
import { searchSkillsTool } from "./search-skills.ts";
import { createWriteSkillTool } from "./write-skill.ts";

function resolveToolkitOntology() {
  const installed = getInstalledMemoriesOntology();
  if (installed !== undefined) {
    return resolveHarnessMemoriesOntology(installed);
  }
  return minimalHarnessMemoriesOntology;
}

export const skillsToolkit = dynamicToolkit<"skills", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.skills,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.skills)],
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
            "Author, search, refine, and activate specialized skills stored in the _root_/_skills_ memory namespace.",
          ],
        },
      ),
    ];
  },
});
