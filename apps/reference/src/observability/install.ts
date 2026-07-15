import { openSync } from "node:fs";
import { createAgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import {
  type CreateHarnessLoggerOptions,
  getCurrentAttribution,
  getNetworkLogContext,
  installHarnessObservability,
  networkEventSessionJsonlPath,
} from "@khoralabs/agent-net";
import { metrics, trace } from "@opentelemetry/api";
import type { Logger } from "pino";
import pino from "pino";

export type InitReferenceObservabilityOptions = {
  serviceName: string;
  /** When set with a bound network log context, append session id to OTEL resource attrs. */
  sessionId?: string;
};

let otelInitialized = false;
let rootLogger: Logger | undefined;
let pinoJsonlFd: number | undefined;

function initOtelOnce(opts: InitReferenceObservabilityOptions): void {
  if (otelInitialized) return;
  otelInitialized = true;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) return;

  const sessionId = opts.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    const existing = process.env.OTEL_RESOURCE_ATTRIBUTES?.trim() ?? "";
    const sessionAttr = `swarm.session_id=${sessionId}`;
    process.env.OTEL_RESOURCE_ATTRIBUTES =
      existing.length > 0 ? `${existing},${sessionAttr}` : sessionAttr;
  }

  void import("@khoralabs/observability/otel")
    .then(({ initOtel }) => {
      initOtel({ serviceName: opts.serviceName });
    })
    .catch(() => undefined);
}

function ensureRootLogger(): Logger {
  if (rootLogger !== undefined) return rootLogger;

  const ctx = getNetworkLogContext();
  const streams: pino.StreamEntry[] = [{ stream: pino.destination(2) }];

  if (ctx !== undefined) {
    const jsonlPath = networkEventSessionJsonlPath(ctx.dataDir, ctx.sessionId);
    pinoJsonlFd = openSync(jsonlPath, "a");
    streams.unshift({ stream: pino.destination({ dest: pinoJsonlFd, sync: true }) });
  }

  rootLogger = pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      name: "network-harness",
      mixin() {
        const attribution = getCurrentAttribution();
        const sessionId = getNetworkLogContext()?.sessionId;
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

function createLogger(opts: CreateHarnessLoggerOptions): Logger {
  return ensureRootLogger().child({
    name: opts.name,
    ...(opts.source !== undefined ? { source: opts.source } : {}),
    ...(opts.agentDid !== undefined ? { agentDid: opts.agentDid } : {}),
  });
}

/**
 * Wire OTEL + Pino into the harness observability surface.
 * Call after `initNetworkLog` when a session JSONL sink is desired.
 */
export function installReferenceObservability(opts: InitReferenceObservabilityOptions): void {
  initOtelOnce(opts);

  const tracer = trace.getTracer(opts.serviceName);
  const meter = metrics.getMeter(opts.serviceName);

  installHarnessObservability({
    createLogger,
    createAgentTelemetry(agentDid) {
      const logger = createLogger({
        name: opts.serviceName,
        source: "agent",
        agentDid,
      });
      return createAgentTelemetry({ tracer, logger, meter });
    },
  });
}
