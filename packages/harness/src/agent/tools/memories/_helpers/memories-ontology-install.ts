import type { HarnessMemoriesOntology } from "./memories-client.ts";

/** Process-local ontology for workflow workers that create memories clients outside spawn. */
let installed: HarnessMemoriesOntology | undefined;

export function installMemoriesOntology(ontology: HarnessMemoriesOntology): void {
  installed = ontology;
}

export function getInstalledMemoriesOntology(): HarnessMemoriesOntology | undefined {
  return installed;
}

export function requireInstalledMemoriesOntology(): HarnessMemoriesOntology {
  if (installed === undefined) {
    throw new Error(
      "No memories ontology installed. Call installMemoriesOntology from the hosting app before creating memories clients.",
    );
  }
  return installed;
}

export function resetMemoriesOntologyForTests(): void {
  installed = undefined;
}
