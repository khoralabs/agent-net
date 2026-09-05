/**
 * Memories control-plane helpers (ontology install, deferred client, write-scope).
 * Prefer `./integrate/write-scope` / `./integrate/memory-event` for integrate-only hosts.
 */

export {
  type AgentMemoriesClient,
  createBoundAgentMemoriesClient,
} from "../memories-types.ts";
export {
  type IntegrateMemoryWriteScope,
  isIntegrateMemoryWriteScope,
  isUnderNamespace,
  parseIntegrateMemoryWriteScope,
  resolveWriteNamespaceChoice,
  type WriteScopeNeighborSearchOptions,
  writeScopeNamespaceCandidates,
  writeScopeNeedsNamespaceChoice,
  writeScopeNeighborSearchOptions,
} from "./integrate/write-scope.ts";
export {
  getInstalledMemoriesOntology,
  installMemoriesOntology,
} from "./tools/_helpers/memories-ontology-install.ts";
