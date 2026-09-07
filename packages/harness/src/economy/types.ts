/**
 * Public contracts for the agent-based computational economics (ACE) testbed.
 * Scenario-owned payoffs, goods, and institutions stay opaque to the harness.
 */

export type EconomyConfig = {
  sessionId: string;
  dataDir: string;
  actorCount: number;
  /** Compute (token) budget for LLM turns — distinct from scenario economic resources. */
  maxTokenBudget: number;
  maxRounds: number;
  model: { id: string; maxSteps?: number };
  /** Optional public labels; length must equal actorCount when set. */
  actorLabels?: string[];
};

export type EconomyActor = {
  did: string;
  agentId: string;
  label: string;
  selfThreadId: string;
  registeredStaticHash: string;
};

export type EconomySessionStatus = "setup" | "running" | "completed" | "teardown";

export type EconomyPersistedState = {
  id: string;
  sessionId: string;
  config: EconomyConfig;
  tokensUsed: number;
  actors: EconomyActor[];
  currentRoundIndex: number;
  status: EconomySessionStatus;
};

export type EconomyRoundStatus = "pending" | "running" | "completed" | "skipped";

export type EconomyRound = {
  sessionId: string;
  roundIndex: number;
  status: EconomyRoundStatus;
  encounterIds: string[];
  startedAtMs?: number;
  completedAtMs?: number;
};

export type EconomyEncounterStatus = "scheduled" | "running" | "completed" | "failed" | "cancelled";

export type EconomyEncounter = {
  id: string;
  sessionId: string;
  roundIndex: number;
  initiatorDid: string;
  counterpartyDid: string;
  chainId?: string;
  isRepeat: boolean;
  priorEncounterId?: string;
  status: EconomyEncounterStatus;
  turnsCompleted: number;
  tokensUsed: number;
  terminalOutcome?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

export type EconomyResult = {
  sessionId: string;
  tokensUsed: number;
  maxTokenBudget: number;
  roundsCompleted: number;
  encounterCount: number;
  actorDids: string[];
  /** Opaque host/scenario summary; harness does not interpret. */
  scenarioOutcome?: unknown;
};

export type EconomyScenarioContext = {
  sessionId: string;
  roundIndex: number;
  actors: readonly EconomyActor[];
  /** Opaque host bag; never include plaintext private objectives in shared events. */
  scenarioState: unknown;
};

export type EconomyScheduledEncounter = {
  initiatorDid: string;
  counterpartyDid: string;
  /** Scenario-private encounter bag — not written into shared NetworkEvent payloads. */
  scenarioPayload?: unknown;
};

/**
 * Host-injected scenario. The harness schedules rounds/encounters from these hooks
 * and never embeds a specific market institution.
 */
export type EconomyScenarioHookResult = { scenarioState?: unknown } | undefined;

export type EconomyScenario = {
  id: string;
  prepareActors?(input: {
    actors: EconomyActor[];
    scenarioState: unknown;
  }): EconomyScenarioHookResult | Promise<EconomyScenarioHookResult>;
  prepareRound?(
    ctx: EconomyScenarioContext,
  ): EconomyScenarioHookResult | Promise<EconomyScenarioHookResult>;
  scheduleEncounters(
    ctx: EconomyScenarioContext,
  ): Promise<EconomyScheduledEncounter[]> | EconomyScheduledEncounter[];
  afterEncounter?(
    input: EconomyScenarioContext & { encounter: EconomyEncounter },
  ): EconomyScenarioHookResult | Promise<EconomyScenarioHookResult>;
  shouldTerminate(
    ctx: EconomyScenarioContext & { tokensUsed: number; maxTokenBudget: number },
  ): boolean | Promise<boolean>;
};
