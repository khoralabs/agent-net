import { dynamicToolkit, toolkit } from "@khoralabs/agent-capabilities";

import type { HarnessToolkitEnv } from "../types.ts";
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
  name: "memories",
  create: async (ctx) => {
    const instructions = [
      "Persistent memory database for recalling and storing notes, observations, and context across turns.",
    ];
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
