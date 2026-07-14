import { toolkit } from "@khoralabs/agent-capabilities";

import { chatToolkit } from "./chat/_toolkit.ts";
import { khoraToolkit } from "./khora/_toolkit.ts";
import { memoriesToolkit } from "./memories/_toolkit.ts";
import { skillsToolkit } from "./skills/_toolkit.ts";

export const harnessToolkit = toolkit([memoriesToolkit, skillsToolkit, khoraToolkit, chatToolkit], {
  name: "network-harness",
});
