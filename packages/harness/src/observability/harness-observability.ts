import type { CapabilityLink, ToolPipelineHooks } from "@khoralabs/agent-capabilities";

export type HarnessLogger = {
  info: (obj: object, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => HarnessLogger;
};

export type HarnessAgentTelemetry = {
  pipelineHooks?: ToolPipelineHooks;
  linkCapture: (args: {
    link: CapabilityLink;
    toolRefs?: Array<{ toolKey: string; toolHash: string }>;
    invocationContext?: unknown;
    sessionContext?: Record<string, unknown>;
  }) => void;
};

export type CreateHarnessLoggerOptions = {
  name: string;
  source?: string;
  agentDid?: string;
};

export type HarnessObservability = {
  createLogger: (opts: CreateHarnessLoggerOptions) => HarnessLogger;
  createAgentTelemetry: (agentDid?: string) => HarnessAgentTelemetry;
};

const noopLogger: HarnessLogger = {
  info() {},
  child() {
    return noopLogger;
  },
};

const noopTelemetry: HarnessAgentTelemetry = {
  linkCapture() {},
};

const noopObservability: HarnessObservability = {
  createLogger() {
    return noopLogger;
  },
  createAgentTelemetry() {
    return noopTelemetry;
  },
};

let installed: HarnessObservability | undefined;

export function installHarnessObservability(obs: HarnessObservability): void {
  installed = obs;
}

export function getHarnessObservability(): HarnessObservability {
  return installed ?? noopObservability;
}

export function createHarnessAgentTelemetry(agentDid?: string): HarnessAgentTelemetry {
  return getHarnessObservability().createAgentTelemetry(agentDid);
}

export function resetHarnessObservabilityForTests(): void {
  installed = undefined;
}
