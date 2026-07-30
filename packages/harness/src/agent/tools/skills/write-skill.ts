import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";
import { toolEnabled } from "../_helpers/disable-policies.ts";

import { writeMemoryNode } from "../memories/_helpers/memory-write.ts";
import { resolveWriteMemoryOptions } from "../memories/_helpers/write-memory-options.ts";
import { hasMemoriesClient } from "../policies.ts";
import type { HarnessToolkitEnv } from "../types.ts";
import {
  defaultSkillKey,
  formatSkillDocument,
  SKILLS_NAMESPACE,
  skillRecordFromText,
  upsertSkillInEnv,
} from "./_helpers/skills.ts";

const zSkillLink = z.object({
  namespace: z
    .string()
    .min(1)
    .optional()
    .describe("Peer namespace. Defaults to the skills namespace; may target any namespace."),
  key: z.string().min(1).describe("Peer memory key."),
  direction: z.enum(["in", "out"]).optional(),
  label: z.string().min(1).optional(),
});

export const writeSkillTool = tool<
  "writeSkill",
  {
    name: string;
    description: string;
    body: string;
    key?: string;
    links?: Array<z.infer<typeof zSkillLink>>;
    /** @deprecated Prefer `links` with optional namespace for cross-NS peers. */
    linksTo?: string[];
  },
  { memoryIds: string[]; key: string; name: string },
  HarnessToolkitEnv
>({
  name: "writeSkill",
  description:
    "Write or update a skill in the _root_/_skills_ namespace. Alias for an embedded memory write with skill frontmatter; enqueues the same async graph integration as writeMemory. Links may target memories outside the skills namespace.",
  instructions: [
    "Author skills in the _root_/_skills_ namespace (alias for a structured memory write).",
    "For skill refinements, prefer readSkillLines + replaceSkillLines.",
  ],
  inputSchema: z.object({
    name: z.string().min(1).describe("Skill display name."),
    description: z.string().min(1).describe("Short skill summary for the catalog."),
    body: z.string().min(1).describe("Full skill instructions (markdown)."),
    key: z
      .string()
      .min(1)
      .optional()
      .describe("Storage key within the _root_/_skills_ namespace. Defaults to a slug of name."),
    links: z
      .array(zSkillLink)
      .optional()
      .describe("Directed links to peer memories (any namespace; defaults to skills namespace)."),
    linksTo: z
      .array(z.string().min(1))
      .optional()
      .describe("Deprecated: other skill keys in the skills namespace. Prefer links."),
  }),
  policies: [hasMemoriesClient, toolEnabled("writeSkill")],
  handler: async (ctx, input) => {
    const client = ctx.env.memoriesClient;
    if (client === undefined) throw new Error("memories client is not configured");

    const name = input.name.trim();
    const key = input.key?.trim() || defaultSkillKey(name);
    if (key.length === 0) throw new Error("skill key is required");

    const text = formatSkillDocument(name, input.description, input.body);
    const links = [
      ...(input.links?.map((link) => ({
        namespace: link.namespace?.trim() || SKILLS_NAMESPACE,
        key: link.key.trim(),
        direction: link.direction,
        label: link.label,
      })) ?? []),
      ...(input.linksTo?.map((peerKey) => ({
        namespace: SKILLS_NAMESPACE,
        key: peerKey.trim(),
      })) ?? []),
    ];

    const memoryIds = await writeMemoryNode(
      client,
      {
        namespace: SKILLS_NAMESPACE,
        key,
        text,
        ...(links.length > 0 ? { links } : {}),
      },
      resolveWriteMemoryOptions(ctx.env, "writeSkill"),
    );

    const skill = skillRecordFromText(SKILLS_NAMESPACE, key, text);
    upsertSkillInEnv(ctx.env.skills, skill);

    return { memoryIds, key, name: skill.name };
  },
});
