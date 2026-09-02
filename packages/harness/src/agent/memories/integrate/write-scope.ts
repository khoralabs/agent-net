/**
 * Integrate-memory write-scope policy — re-export memories-agents wire.
 * Durable workflow steps stay in the host; this module owns the pure rules surface.
 */
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
} from "@khoralabs/memories-agents/integrator/wire";
