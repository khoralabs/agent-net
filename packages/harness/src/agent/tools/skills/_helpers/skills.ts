import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import { loadMemoryTextByKey } from "../../memories/_helpers/memory-text.ts";

export const SKILLS_NAMESPACE = "skills";

const SKILL_SEARCH_OPTIONS = {
  topK: 100,
  neighbors: false as const,
  arms: { lexical: 1, vector: 0 },
};

function sourceMapIdFromHit(hit: import("@khoralabs/memories-node").SearchHit): string {
  return hit._id;
}

export type SkillRecord = {
  name: string;
  description: string;
  body: string;
  namespace: string;
  key: string;
};

export function formatSkillDocument(name: string, description: string, body: string): string {
  return `---\nname: ${name.trim()}\ndescription: ${description.trim()}\n---\n\n${body.trim()}`;
}

export function defaultSkillKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontmatter(
  content: string,
  location: string,
): Omit<SkillRecord, "namespace" | "key"> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`skill is missing frontmatter: ${location}`);
  const frontmatter = match[1];
  const body = match[2] ?? "";
  if (frontmatter === undefined) throw new Error(`skill is missing frontmatter: ${location}`);
  const metadata: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();
    metadata[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  const name = metadata.name?.trim();
  const description = metadata.description?.trim();
  if (!name) throw new Error(`skill is missing name: ${location}`);
  if (!description) throw new Error(`skill is missing description: ${location}`);
  return { name, description, body: body.trim() };
}

export function skillRecordFromText(namespace: string, key: string, text: string): SkillRecord {
  const parsed = parseFrontmatter(text, `${namespace}/${key}`);
  return { ...parsed, namespace, key };
}

export function formatSkillCatalog(skills: SkillRecord[]): string {
  if (skills.length === 0) return "";
  const entries = skills
    .map(
      (skill) =>
        `<skill><name>${skill.name}</name><description>${skill.description}</description><namespace>${skill.namespace}</namespace></skill>`,
    )
    .join("\n");
  return `<available_skills>\n${entries}\n</available_skills>`;
}

export function formatActivatedSkillContent(skill: SkillRecord): string {
  return `<skill_content name="${skill.name}">
${skill.body}

Skill namespace: ${skill.namespace}
Skill key: ${skill.key}
</skill_content>`;
}

export function resolveSkillStorageKey(skills: SkillRecord[], nameOrKey: string): string {
  const value = nameOrKey.trim();
  if (value.length === 0) throw new Error("skill key is required");
  const skill = skills.find((item) => item.name === value || item.key === value);
  return skill?.key ?? value;
}

export function upsertSkillInEnv(skills: SkillRecord[], skill: SkillRecord): void {
  const existingIndex = skills.findIndex(
    (item) => item.key === skill.key || item.name === skill.name,
  );
  if (existingIndex >= 0) {
    skills[existingIndex] = skill;
  } else {
    skills.push(skill);
  }
}

async function fetchSkillTextByKey(
  client: RemoteMemoriesClientAsync,
  key: string,
): Promise<string | undefined> {
  return loadMemoryTextByKey(client, SKILLS_NAMESPACE, key);
}

export async function loadSkillTextByKey(
  client: RemoteMemoriesClientAsync,
  key: string,
): Promise<string | undefined> {
  return fetchSkillTextByKey(client, key);
}

export async function loadSkillByKey(
  client: RemoteMemoriesClientAsync,
  key: string,
): Promise<SkillRecord | undefined> {
  const text = await fetchSkillTextByKey(client, key);
  if (text === undefined) return undefined;
  return skillRecordFromText(SKILLS_NAMESPACE, key, text);
}

export async function discoverSkillsFromMemories(
  client: RemoteMemoriesClientAsync,
): Promise<SkillRecord[]> {
  const { hits } = await client.search({
    namespace: SKILLS_NAMESPACE,
    content: { text: "skill" },
    options: SKILL_SEARCH_OPTIONS,
  });

  const byKey = new Map<string, SkillRecord>();
  for (const hit of hits) {
    const key = hit.memory.key;
    if (byKey.has(key)) continue;
    const text = await client.persistence.getSourceMapTextPreview(sourceMapIdFromHit(hit), 100_000);
    if (text === null || text.length === 0) continue;
    try {
      byKey.set(key, skillRecordFromText(SKILLS_NAMESPACE, key, text));
    } catch {}
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
