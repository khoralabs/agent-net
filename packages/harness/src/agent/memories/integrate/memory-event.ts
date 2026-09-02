/**
 * Serializable integrate-memory event wire — re-export memories-agents wire.
 * Durable workflow steps stay in the host; this module owns the parse/types surface.
 */
export {
  type IntegrateMemoryEvent,
  type IntegrateMemoryEventKind,
  type IntegrateMemoryFeatures,
  type IntegrateMemoryWriteScope,
  joinIntegrateLexical,
  parseIntegrateMemoryEvent,
} from "@khoralabs/memories-agents/integrator/wire";
