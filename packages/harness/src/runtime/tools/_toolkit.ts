import { toolkit } from "@khoralabs/agent-capabilities";
import { skillsToolkit } from "../../agent/memories/skills/_toolkit.ts";
import { memoriesToolkit } from "../../agent/memories/tools/_toolkit.ts";
import { chatToolkit } from "../../agent/social/message/tools/_toolkit.ts";
import { khoraToolkit } from "../../agent/social/tools/_toolkit.ts";

export const harnessToolkit = toolkit([memoriesToolkit, skillsToolkit, khoraToolkit, chatToolkit], {
  name: "network-harness",
});
