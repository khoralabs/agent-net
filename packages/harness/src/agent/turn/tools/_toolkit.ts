import { toolkit } from "@khoralabs/agent-capabilities";
import { skillsToolkit } from "../../memories/skills/_toolkit.ts";
import { memoriesToolkit } from "../../memories/tools/_toolkit.ts";
import { chatToolkit } from "../../social/message/tools/_toolkit.ts";
import { khoraToolkit } from "../../social/tools/_toolkit.ts";

export const harnessToolkit = toolkit([memoriesToolkit, skillsToolkit, khoraToolkit, chatToolkit], {
  name: "network-harness",
});
