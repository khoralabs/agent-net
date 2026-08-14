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

  const instructions: string[] = [];

  const name = context.name?.trim();
  if (name !== undefined && name.length > 0) {
    instructions.push(`This memory database is for: ${name}.`);
  }

  const about = context.about.trim();
  instructions.push(about.length > 0 ? about : GENERIC_MEMORIES_INSTRUCTION);

  const base = context.baseUnderstanding?.trim();
  if (base !== undefined && base.length > 0) {
    instructions.push(`Base understanding:\n${base}`);
  }

  return instructions;
}
