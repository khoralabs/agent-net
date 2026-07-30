import type { MemoriesDatabaseContext } from "../../../types.ts";

const GENERIC_MEMORIES_INSTRUCTION =
  "Persistent memory database for recalling and storing notes, observations, and context across turns.";

/** Build memories-toolkit instruction lines from optional host framing. */
export function formatMemoriesContextInstructions(
  context: MemoriesDatabaseContext | undefined,
): string[] {
  if (context === undefined) {
    return [GENERIC_MEMORIES_INSTRUCTION];
  }

  const about = context.about.trim();
  const instructions: string[] = [about.length > 0 ? about : GENERIC_MEMORIES_INSTRUCTION];

  const base = context.baseUnderstanding?.trim();
  if (base !== undefined && base.length > 0) {
    instructions.push(`Base understanding:\n${base}`);
  }

  const namespaces = (context.groundingNamespaces ?? [])
    .map((ns) => ns.trim())
    .filter((ns) => ns.length > 0);
  if (namespaces.length > 0) {
    instructions.push(
      `Also provided: durable grounding under ${namespaces.join(", ")} — search there when needed.`,
    );
  }

  return instructions;
}
