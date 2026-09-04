import { ChatHttpClientError } from "@khoralabs/chat/http/client";
import { KhoraClientError } from "@khoralabs/khora-client";
import { MemoriesServiceClientError } from "@khoralabs/memories-service/client";
import { RelayClientError } from "@khoralabs/relay/client";
import { VellumClientError } from "@khoralabs/vellum-client";

export type BoundaryClientErrorFields = {
  message: string;
  status?: number;
  code?: string;
};

/** Extract status/code from known mid-tier / foundation client errors. */
export function boundaryClientErrorFields(err: unknown): BoundaryClientErrorFields {
  if (
    err instanceof VellumClientError ||
    err instanceof RelayClientError ||
    err instanceof MemoriesServiceClientError ||
    err instanceof KhoraClientError ||
    err instanceof ChatHttpClientError
  ) {
    return {
      message: err.message,
      status: err.status,
      ...(err.code !== undefined ? { code: err.code } : {}),
    };
  }
  if (err instanceof Error) {
    return { message: err.message.trim().length > 0 ? err.message.trim() : err.name };
  }
  return { message: String(err) };
}

/** Human-readable message including optional `code=` / `status=` for logs and tool errors. */
export function boundaryClientErrorMessage(err: unknown): string {
  const fields = boundaryClientErrorFields(err);
  const parts = [fields.message];
  if (fields.code !== undefined) parts.push(`code=${fields.code}`);
  if (fields.status !== undefined) parts.push(`status=${fields.status}`);
  return parts.join(" ");
}
