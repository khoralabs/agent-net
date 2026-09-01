import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-node/ontology";

export type SwarmMemoriesOntology = OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;

/** Process-local ontology handed from CLI into setupSwarmStep (not serializable). */
const pending = new Map<string, SwarmMemoriesOntology>();

export function provideOntologyForSession(
  sessionId: string,
  ontology: SwarmMemoriesOntology,
): void {
  pending.set(sessionId, ontology);
}

export function takeOntologyForSession(sessionId: string): SwarmMemoriesOntology {
  const ontology = pending.get(sessionId);
  pending.delete(sessionId);
  if (ontology === undefined) {
    throw new Error(
      `No memories ontology provided for session ${sessionId}. Call provideOntologyForSession before starting the swarm workflow.`,
    );
  }
  return ontology;
}

export function clearPendingOntologyForTests(): void {
  pending.clear();
}
