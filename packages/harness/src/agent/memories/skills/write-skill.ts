import { tool } from "@khoralabs/agent-capabilities";
import { writeMemoryNode } from "@khoralabs/memories-node/helpers/agent";
import {
  type AgentMemoriesOntology,
  minimalAgentMemoriesOntology,
  resolveAgentMemoriesOntology,
} from "@khoralabs/memories-service/client/agent";
import { z } from "zod";
import { toolEnabled } from "../../turn/tools/_helpers/disable-policies.ts";
import { hasMemoriesClient } from "../../turn/tools/policies.ts";
import type { HarnessToolkitEnv } from "../../turn/tools/types.ts";
import { memoryLinkSchema, parseMemoryLinkRow } from "../tools/_helpers/ontology-tool-schema.ts";
import { touchRecentNamespaces } from "../tools/_helpers/recent-namespaces.ts";
import { resolveWriteMemoryOptions } from "../tools/_helpers/write-memory-options.ts";
import {
  defaultSkillKey,
  formatSkillDocument,
  SKILLS_NAMESPACE,
  skillRecordFromText,
  upsertSkillInEnv,
} from "./_helpers/skills.ts";

export type WriteSkillResult =
  | { memoryIds: string[]; key: string; name: string; namespace: string }
  | { memoryIds: []; error: string };

export function createWriteSkillTool(ontology: AgentMemoriesOntology) {
  const resolved = resolveAgentMemoriesOntology(ontology);
  const zLink = memoryLinkSchema(resolved, { namespaceOptional: true });

  return tool<
    "writeSkill",
    {
      name: string;
      description: string;
      body: string;
      key?: string;
      links?: Array<Record<string, unknown>>;
      linksTo?: string[];
    },
    WriteSkillResult,
    HarnessToolkitEnv
  >({
    name: "writeSkill",
    description:
      "Write or update a skill in the _skills_ namespace. Alias for an embedded memory write with skill frontmatter; enqueues the same async graph integration as writeMemory. Links may target memories outside the skills namespace.",
    instructions: [
      "Author skills in the _skills_ namespace (alias for a structured memory write).",
      "Peer links need namespace + key from search hits. Set at most one edge-kind field per link.",
      "For skill refinements, prefer resolveSkills (enumerateLines: true) + replaceSkillLines.",
    ],
    inputSchema: z.object({
      name: z.string().min(1).describe("Skill display name."),
      description: z.string().min(1).describe("Short skill summary for the catalog."),
      body: z.string().min(1).describe("Full skill instructions (markdown)."),
      key: z
        .string()
        .min(1)
        .optional()
        .describe("Storage key within the _skills_ namespace. Defaults to a slug of name."),
      links: z
        .array(zLink)
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
      if (client === undefined) {
        return { memoryIds: [], error: "memories client is not configured" };
      }

      try {
        const name = input.name.trim();
        const key = input.key?.trim() || defaultSkillKey(name);
        if (key.length === 0) {
          return { memoryIds: [], error: "skill key is required" };
        }

        const text = formatSkillDocument(name, input.description, input.body);
        const links = [
          ...(input.links?.map((row) =>
            parseMemoryLinkRow(row as Record<string, unknown>, resolved, {
              namespace: SKILLS_NAMESPACE,
            }),
          ) ?? []),
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
        await touchRecentNamespaces(ctx.env.recentNamespaces, [SKILLS_NAMESPACE]);

        return { memoryIds, key, name: skill.name, namespace: SKILLS_NAMESPACE };
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0 ? err.message.trim() : String(err);
        return { memoryIds: [], error: message };
      }
    },
  });
}

export const writeSkillTool = createWriteSkillTool(minimalAgentMemoriesOntology);
