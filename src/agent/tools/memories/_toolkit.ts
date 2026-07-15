import { toolkit } from "@khoralabs/agent-capabilities";

import { readMemoryLinesTool } from "./read-memory-lines.ts";
import { replaceMemoryLinesTool } from "./replace-memory-lines.ts";
import { searchMemoriesTool } from "./search-memories.ts";
import { writeMemoryTool } from "./write-memory.ts";

export const memoriesToolkit = toolkit(
  [searchMemoriesTool, writeMemoryTool, readMemoryLinesTool, replaceMemoryLinesTool],
  {
    name: "memories",
    instructions: [
      "Persistent memory database for recalling and storing notes, observations, and context across turns.",
    ],
  },
);
