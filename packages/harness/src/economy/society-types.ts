/** Actor-driven society contracts. Legacy EconomyScenario remains round-oriented. */
export type ActorWakeReason = "initial" | "event" | "periodic" | "requested" | "negotiation";
export type ActorWakeStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type ActorWake = {
  id: string;
  sessionId: string;
  actorDid: string;
  reason: ActorWakeReason;
  dueAtMs: number;
  status: ActorWakeStatus;
  attempts: number;
  dedupeKey?: string;
  /** Private to the recipient; never broadcast in shared telemetry. */
  payload?: unknown;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SocietyConfig = {
  sessionId: string;
  dataDir: string;
  actorDids: string[];
  maxTokenBudget: number;
  maxActorTurns: number;
  /** Defaults to 60 seconds; zero disables background wakes. */
  cadenceMs?: number;
  /** Bounds actors executing simultaneously; each actor is always serialized. */
  maxConcurrentActors?: number;
};

export type SocietyScenario = {
  id: string;
  /** Establish private objectives and environmental initial conditions. */
  prepare?(): Promise<void>;
  /** Return only this actor's private objective and observations. */
  observe(input: { actorDid: string; wake: ActorWake }): Promise<unknown>;
  /** Environmental effects only; does not choose counterparties or actor actions. */
  afterTurn?(input: { actorDid: string; wakeId: string; tokensUsed: number }): Promise<void>;
  shouldTerminate(): Promise<boolean>;
};

export type SocietyActorTurn = (input: {
  actorDid: string;
  wake: ActorWake;
  observation: unknown;
  signal: AbortSignal;
}) => Promise<{ tokensUsed: number }>;

export type SocietyRunResult = {
  sessionId: string;
  turnsCompleted: number;
  tokensUsed: number;
  termination: "scenario" | "token-budget" | "turn-limit" | "stopped";
};
