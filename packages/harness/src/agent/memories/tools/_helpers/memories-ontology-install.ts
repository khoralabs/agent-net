import type { AgentMemoriesOntology } from "@khoralabs/memories-service/client/agent";

/** Process-local ontology for workflow workers that create memories clients outside spawn. */
let installed: AgentMemoriesOntology | undefined;

export function installMemoriesOntology(ontology: AgentMemoriesOntology): void {
  installed = ontology;
}

export function getInstalledMemoriesOntology(): AgentMemoriesOntology | undefined {
  return installed;
}

export function requireInstalledMemoriesOntology(): AgentMemoriesOntology {
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
