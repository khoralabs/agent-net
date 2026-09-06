import { resolveCliConfig } from "../config/load.ts";
import type { FlagMap } from "../lib/argv.ts";
import { boolFlag } from "../lib/argv.ts";
import { CommandExitError } from "../lib/errors.ts";
import { printJson } from "../lib/json-out.ts";

export type CheckResult = {
  service: string;
  baseUrl: string;
  ok: boolean;
  detail?: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function checkHealth(
  service: string,
  baseUrl: string,
  healthPath: string,
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const url = `${baseUrl.replace(/\/$/, "")}${healthPath}`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) {
      return { service, baseUrl, ok: false, detail: `HTTP ${res.status}` };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      const body = (await res.json()) as { ok?: unknown; status?: unknown };
      if (body.ok === false) {
        return { service, baseUrl, ok: false, detail: "JSON ok: false" };
      }
      if (typeof body.status === "string") {
        const s = body.status.toLowerCase();
        if (s === "error" || s === "fail" || s === "unhealthy") {
          return { service, baseUrl, ok: false, detail: `status: ${body.status}` };
        }
      }
    }
    return { service, baseUrl, ok: true };
  } catch (e) {
    return {
      service,
      baseUrl,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

const HEALTH = {
  khora: "/health",
  relay: "/health",
  memories: "/health",
  chat: "/health",
} as const;

export async function handleDoctor(flags: FlagMap): Promise<void> {
  const { config } = resolveCliConfig(flags);
  const checks = await Promise.all([
    checkHealth("khora", config.khora.baseUrl, HEALTH.khora),
    checkHealth("relay", config.relay.baseUrl, HEALTH.relay),
    checkHealth("memories", config.memories.baseUrl, HEALTH.memories),
    checkHealth("chat", config.chat.baseUrl, HEALTH.chat),
  ]);
  const tokens = {
    memoriesAdminToken: config.memories.adminToken.trim().length > 0,
    chatToken: config.chat.token.trim().length > 0,
  };
  const ok = checks.every((c) => c.ok) && tokens.memoriesAdminToken && tokens.chatToken;
  const report = { ok, checks, tokens, dataDir: config.dataDir };
  const asJson = boolFlag(flags, "json");

  if (asJson) {
    printJson(report);
  } else {
    for (const c of checks) {
      console.log(
        `${c.ok ? "ok" : "FAIL"}  ${c.service}  ${c.baseUrl}${c.detail ? ` (${c.detail})` : ""}`,
      );
    }
    console.log(
      `${tokens.memoriesAdminToken ? "ok" : "FAIL"}  memories.adminToken  ${tokens.memoriesAdminToken ? "set" : "missing"}`,
    );
    console.log(
      `${tokens.chatToken ? "ok" : "FAIL"}  chat.token  ${tokens.chatToken ? "set" : "missing"}`,
    );
    console.log(ok ? "doctor: all checks passed" : "doctor: one or more checks failed");
  }

  if (!ok) {
    throw new CommandExitError("doctor failed", { alreadyPrinted: asJson });
  }
}
