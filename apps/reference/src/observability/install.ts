import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import {
  type CreateHarnessLoggerOptions,
  getCurrentAttribution,
  getNetworkSessionContext,
  installHarnessObservability,
} from "@khoralabs/agent-net";
import { noopMemoriesTelemetry } from "@khoralabs/memories-node/telemetry";
import type { Logger } from "pino";
import pino from "pino";

export type InitReferenceObservabilityOptions = {
  serviceName: string;
  /** Optional pino dual-write path (from network-events plugin). */
  sessionJsonlPath?: string;
};

let rootLogger: Logger | undefined;
let pinoJsonlFd: number | undefined;
let pendingJsonlPath: string | undefined;

function ensureRootLogger(serviceName: string): Logger {
  if (rootLogger !== undefined) return rootLogger;

  const streams: pino.StreamEntry[] = [{ stream: pino.destination(2) }];

  if (pendingJsonlPath !== undefined) {
    mkdirSync(path.dirname(pendingJsonlPath), { recursive: true });
    pinoJsonlFd = openSync(pendingJsonlPath, "a");
    streams.unshift({ stream: pino.destination({ dest: pinoJsonlFd, sync: true }) });
  }

  rootLogger = pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      name: serviceName,
      mixin() {
        const attribution = getCurrentAttribution();
        const sessionId = getNetworkSessionContext()?.sessionId;
        return {
          ...(sessionId !== undefined ? { sessionId } : {}),
          ...(attribution !== undefined
            ? { attributionDigestHex: attribution.attributionDigestHex }
            : {}),
        };
      },
    },
    streams.length > 1 ? pino.multistream(streams) : streams[0]?.stream,
  );

  return rootLogger;
}

function createLogger(serviceName: string, opts: CreateHarnessLoggerOptions): Logger {
  return ensureRootLogger(serviceName).child({
    name: opts.name,
    ...(opts.source !== undefined ? { source: opts.source } : {}),
    ...(opts.agentDid !== undefined ? { agentDid: opts.agentDid } : {}),
  });
}

/**
 * Wire Pino into the harness observability surface (noop agent + memories sinks).
 * Pass `sessionJsonlPath` from the network-events plugin when a session JSONL sink is desired.
 */
export function installReferenceObservability(opts: InitReferenceObservabilityOptions): void {
  pendingJsonlPath = opts.sessionJsonlPath?.trim() || undefined;
  ensureRootLogger(opts.serviceName);

  installHarnessObservability({
    createLogger(loggerOpts) {
      return createLogger(opts.serviceName, loggerOpts);
    },
    createAgentTelemetry() {
      return { linkCapture() {} };
    },
    createMemoriesTelemetry() {
      return noopMemoriesTelemetry;
    },
  });
}
