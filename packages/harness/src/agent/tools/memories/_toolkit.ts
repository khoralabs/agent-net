import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import { toolkitEnabled } from "../_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "../ids.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { resolveHarnessMemoriesOntology } from "./_helpers/memories-client.ts";
import { formatMemoriesContextInstructions } from "./_helpers/memories-context-instructions.ts";
import { getInstalledMemoriesOntology } from "./_helpers/memories-ontology-install.ts";
import { minimalHarnessMemoriesOntology } from "./_helpers/minimal-ontology.ts";
import {
  formatRecentNamespacesInstruction,
  RECENT_NAMESPACES_TOP_K,
} from "./_helpers/recent-namespaces.ts";
import { listNamespacesTool } from "./list-namespaces.ts";
import { replaceMemoryLinesTool } from "./replace-memory-lines.ts";
import { resolveMemoriesTool } from "./resolve-memories.ts";
import { searchMemoriesTool } from "./search-memories.ts";
import { createWriteMemoryTool } from "./write-memory.ts";

function resolveToolkitOntology() {
  const installed = getInstalledMemoriesOntology();
  if (installed !== undefined) {
    return resolveHarnessMemoriesOntology(installed);
  }
  return minimalHarnessMemoriesOntology;
}

export const memoriesToolkit = dynamicToolkit<"memories", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.memories,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.memories)],
  create: async (ctx) => {
    const instructions = formatMemoriesContextInstructions(ctx.env.memoriesContext);
    const recent = formatRecentNamespacesInstruction(
      ctx.env.recentNamespaces.top(RECENT_NAMESPACES_TOP_K),
    );
    if (recent !== undefined) instructions.push(recent);

    const writeMemoryTool = createWriteMemoryTool(resolveToolkitOntology());

    return [
      toolkit(
        [
          searchMemoriesTool,
          writeMemoryTool,
          resolveMemoriesTool,
          replaceMemoryLinesTool,
          listNamespacesTool,
        ],
        {
          name: "memories-core",
          instructions,
        },
      ),
    ];
  },
});
