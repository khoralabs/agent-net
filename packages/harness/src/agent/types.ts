import type { ThreadHashSnapshot } from "../network/types.ts";

export type AgentUIMessage = {
  id: string;
  role: string;
  parts: Array<{ type: string } & Record<string, unknown>>;
  metadata?: unknown;
};

/** Host-supplied framing for the agent's memories database (injected into memories toolkit). */
export type MemoriesDatabaseContext = {
  /** Human label for this DB (e.g. company name). */
  name?: string;
  /** One short paragraph: what this DB is about (host-defined domain; not harness-interpreted). */
  about: string;
  /** Optional short grounding prose the agent should treat as known. */
  baseUnderstanding?: string;
  /**
   * Optional namespaces where durable grounding lives.
   * Host-derived (project, org, personal, etc.) — harness only renders them.
   */
  groundingNamespaces?: string[];
};

/** One namespace catalog row projected into LLM step context. */
export type AgentStepNamespaceEntry = {
  namespace: string;
  alias?: string | null;
  description?: string;
};

/** External ingest source facet (prose only; host maps domain ids into sourceId). */
export type AgentStepSourceContext = {
  /** Opaque host source id (e.g. connection id) for logs/UI — not a harness domain. */
  sourceId?: string;
  label?: string;
  description?: string;
  about?: string;
  directives?: string;
  /** One-shot override from a pull request (ephemeral; not stored on the source). */
  pullDirective?: string;
};

/**
 * Projection bag for an LLM step: gather via sourcemap Stores, then format
 * and provide identically across chat / integrate modes.
 */
export type AgentStepContext = {
  database?: MemoriesDatabaseContext;
  namespaces?: AgentStepNamespaceEntry[];
  source?: AgentStepSourceContext;
  turn?: { instructions?: string[] };
};

export type AgentWorkflowParams = {
  runId: string;
  agent: {
    id: string;
    name: string;
    actingFor: { type: string; id: string };
  };
  model: {
    id: string;
    fallbackIds?: string[];
    maxSteps?: number;
    /** AI SDK reasoning effort (when set by response planner). */
    reasoning?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    /** Soft ceiling on visible completion tokens. */
    maxOutputTokens?: number;
  };
  context: {
    sessionId?: string;
    threadId: string;
    messages: AgentUIMessage[];
    instructions?: string[];
    userTimeZone?: string;
    /**
     * @deprecated Prefer `stepContext.database`. Mapped into stepContext when
     * stepContext.database is unset.
     */
    memoriesDatabase?: MemoriesDatabaseContext;
    /** Unified gather→provide bag for this LLM run. */
    stepContext?: AgentStepContext;
  };
  output: {
    chat: {
      threadId: string;
      postId?: string;
      streamDeltas: boolean;
    };
  };
  /** Per-invocation tool affordance filters (enforced via harness policies). */
  tools?: {
    disableToolkits?: string[];
    disableTools?: string[];
  };
  /** Applied response-plan fields (e.g. pre-activated skill hints). */
  responsePlan?: {
    skillHints?: string[];
  };
};

export type AgentWorkflowResult = {
  runId: string;
  chat: {
    threadId: string;
    postId: string;
    status: "complete" | "aborted";
  };
  message?: AgentUIMessage;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
  };
  memoriesProvenanceRootHex?: string;
  threadHashes?: ThreadHashSnapshot[];
  capabilities: {
    staticHash: string;
    runtimeHash: string;
    invocationHash?: string;
    toolRefs: Array<{ toolKey: string; toolHash: string }>;
    envelopeId?: string;
  };
};
