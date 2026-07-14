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
      "Use searchMemories to recall relevant context from the agent's memory database.",
      "Use writeMemory to persist notes and observations in an appropriate namespace.",
      "Use readMemoryLines to inspect an existing memory as numbered lines before editing it.",
      "Use replaceMemoryLines to refine a memory by replacing specific line numbers.",
      "Prefer line edits over full writeMemory rewrites for small refinements.",
    ],
  },
);
