import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { writeMemoryNode } from "../memories/_helpers/memory-write.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import {
  defaultSkillKey,
  formatSkillDocument,
  SKILLS_NAMESPACE,
  skillRecordFromText,
  upsertSkillInEnv,
} from "./_helpers/skills.ts";

export const writeSkillTool = tool<
  "writeSkill",
  {
    name: string;
    description: string;
    body: string;
    key?: string;
    linksTo?: string[];
  },
  { memoryIds: string[]; key: string; name: string },
  HarnessToolkitEnv
>({
  name: "writeSkill",
  description:
    "Write or update a skill in the skills namespace. This is an alias for writing a memory with skill frontmatter. Use linksTo to link the skill to other existing skills via graph edges.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Skill display name."),
    description: z.string().min(1).describe("Short skill summary for the catalog."),
    body: z.string().min(1).describe("Full skill instructions (markdown)."),
    key: z
      .string()
      .min(1)
      .optional()
      .describe("Storage key within the skills namespace. Defaults to a slug of name."),
    linksTo: z
      .array(z.string().min(1))
      .optional()
      .describe("Other skill keys in the skills namespace to link to."),
  }),
  policies: [hasMemoriesClient],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const name = input.name.trim();
    const key = input.key?.trim() || defaultSkillKey(name);
    if (key.length === 0) throw new Error("skill key is required");

    const text = formatSkillDocument(name, input.description, input.body);
    const memoryIds = await writeMemoryNode(client, {
      namespace: SKILLS_NAMESPACE,
      key,
      text,
      links: input.linksTo?.map((peerKey) => ({
        namespace: SKILLS_NAMESPACE,
        key: peerKey.trim(),
      })),
    });

    const skill = skillRecordFromText(SKILLS_NAMESPACE, key, text);
    upsertSkillInEnv(ctx.env.skills, skill);

    return { memoryIds, key, name: skill.name };
  },
});
