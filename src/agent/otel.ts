import { metrics, trace } from "@opentelemetry/api";

export const tracer = trace.getTracer("network-harness-agent");
export const meter = metrics.getMeter("network-harness-agent");

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
  void import("@khoralabs/observability/otel")
    .then(({ initOtel }) => {
      initOtel({ serviceName: "network-harness-agent" });
    })
    .catch(() => undefined);
}
