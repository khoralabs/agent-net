import { toolkit } from "@khoralabs/agent-capabilities";
import { skillsToolkit } from "../../services/memories/skills/_toolkit.ts";
import { memoriesToolkit } from "../../services/memories/tools/_toolkit.ts";
import { chatToolkit } from "../../services/social/message/tools/_toolkit.ts";
import { khoraToolkit } from "../../services/social/tools/_toolkit.ts";

export const harnessToolkit = toolkit([memoriesToolkit, skillsToolkit, khoraToolkit, chatToolkit], {
  name: "network-harness",
});
