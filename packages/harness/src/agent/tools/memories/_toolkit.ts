import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import { toolkitEnabled } from "../_helpers/disable-policies.ts";
import { HARNESS_TOOLKIT } from "../ids.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import { formatMemoriesContextInstructions } from "./_helpers/memories-context-instructions.ts";
import {
  formatRecentNamespacesInstruction,
  RECENT_NAMESPACES_TOP_K,
} from "./_helpers/recent-namespaces.ts";
import { listNamespacesTool } from "./list-namespaces.ts";
import { readMemoryLinesTool } from "./read-memory-lines.ts";
import { replaceMemoryLinesTool } from "./replace-memory-lines.ts";
import { searchMemoriesTool } from "./search-memories.ts";
import { writeMemoryTool } from "./write-memory.ts";

const memoriesTools = [
  searchMemoriesTool,
  writeMemoryTool,
  readMemoryLinesTool,
  replaceMemoryLinesTool,
  listNamespacesTool,
] as const;

export const memoriesToolkit = dynamicToolkit<"memories", HarnessToolkitEnv>({
  name: HARNESS_TOOLKIT.memories,
  policies: [toolkitEnabled(HARNESS_TOOLKIT.memories)],
  create: async (ctx) => {
    const instructions = formatMemoriesContextInstructions(ctx.env.memoriesContext);
    const recent = formatRecentNamespacesInstruction(
      ctx.env.recentNamespaces.top(RECENT_NAMESPACES_TOP_K),
    );
    if (recent !== undefined) instructions.push(recent);

    return [
      toolkit([...memoriesTools], {
        name: "memories-core",
        instructions,
      }),
    ];
  },
});
