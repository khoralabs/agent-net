import type { LabelSchemaMap, OntologyDefinition } from "@khoralabs/memories-node/ontology";

export type EconomyMemoriesOntology = OntologyDefinition<LabelSchemaMap, LabelSchemaMap>;

const pending = new Map<string, EconomyMemoriesOntology>();

export function provideEconomyOntologyForSession(
  sessionId: string,
  ontology: EconomyMemoriesOntology,
): void {
  pending.set(sessionId, ontology);
}

export function takeEconomyOntologyForSession(sessionId: string): EconomyMemoriesOntology {
  const ontology = pending.get(sessionId);
  pending.delete(sessionId);
  if (ontology === undefined) {
    throw new Error(
      `No memories ontology provided for session ${sessionId}. Call provideEconomyOntologyForSession before starting the economy workflow.`,
    );
  }
  return ontology;
}

export function clearPendingEconomyOntologyForTests(): void {
  pending.clear();
}
