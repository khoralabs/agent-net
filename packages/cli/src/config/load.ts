import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { FlagMap } from "../lib/argv.ts";
import { strFlag } from "../lib/argv.ts";
import {
  type AgentNetCliConfig,
  type AgentNetCliConfigPartial,
  zAgentNetCliConfig,
  zAgentNetCliConfigPartial,
} from "./schema.ts";

const DEFAULT_KHORA = "http://127.0.0.1:8788";
const DEFAULT_RELAY = "http://127.0.0.1:8790";
const DEFAULT_MEMORIES = "http://127.0.0.1:8791";
const DEFAULT_CHAT = "http://127.0.0.1:8792";

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, ".agent-net");
}

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(defaultDataDir(env), "cli.config.json");
}

export function resolveConfigPath(
  flags: FlagMap,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const fromFlag = strFlag(flags, "config")?.trim();
  if (fromFlag !== undefined && fromFlag.length > 0) return path.resolve(fromFlag);
  const fromEnv = env.AGENT_NET_CONFIG?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return path.resolve(fromEnv);
  const def = defaultConfigPath(env);
  return existsSync(def) ? def : null;
}

function stripSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function firstEnv(env: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = env[key]?.trim();
    if (v !== undefined && v.length > 0) return v;
  }
  return undefined;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AgentNetCliConfigPartial {
  const dataDir = env.AGENT_NET_DATA_DIR?.trim() || env.HARNESS_DATA_DIR?.trim();
  const khoraBaseUrl = firstEnv(env, [
    "KHORA_SERVER_URL",
    "HARNESS_KHORA_BASE_URL",
    "KHORA_BASE_URL",
  ]);
  const khoraAdmin = firstEnv(env, [
    "KHORA_ADMIN_TOKEN",
    "ADMIN_ROOT_TOKEN",
    "KHORA_CONSOLE_ROOT_TOKEN",
  ]);
  const relayBaseUrl = firstEnv(env, [
    "RELAY_BASE_URL",
    "HARNESS_RELAY_BASE_URL",
    "RELAY_SERVER_URL",
  ]);
  const memoriesBaseUrl = firstEnv(env, [
    "MEMORIES_SERVICE_URL",
    "HARNESS_MEMORIES_BASE_URL",
    "MEMORIES_BASE_URL",
  ]);
  const memoriesAdmin = env.MEMORIES_SERVICE_ADMIN_TOKEN?.trim();
  const chatBaseUrl = firstEnv(env, ["CHAT_SERVICE_URL", "HARNESS_CHAT_BASE_URL", "CHAT_BASE_URL"]);
  const chatToken = env.CHAT_INTERNAL_TOKEN?.trim();
  const identitySecret = env.HARNESS_IDENTITY_WRAP_KEY?.trim();

  return zAgentNetCliConfigPartial.parse({
    ...(dataDir ? { dataDir } : {}),
    khora: {
      ...(khoraBaseUrl ? { baseUrl: stripSlash(khoraBaseUrl) } : {}),
      ...(khoraAdmin ? { adminToken: khoraAdmin } : {}),
    },
    relay: {
      ...(relayBaseUrl ? { baseUrl: stripSlash(relayBaseUrl) } : {}),
    },
    memories: {
      ...(memoriesBaseUrl ? { baseUrl: stripSlash(memoriesBaseUrl) } : {}),
      ...(memoriesAdmin ? { adminToken: memoriesAdmin } : {}),
    },
    chat: {
      ...(chatBaseUrl ? { baseUrl: stripSlash(chatBaseUrl) } : {}),
      ...(chatToken ? { token: chatToken } : {}),
    },
    ...(identitySecret ? { identitySecret } : {}),
  });
}

export function configFromFlags(flags: FlagMap): AgentNetCliConfigPartial {
  const dataDir = strFlag(flags, "data-dir")?.trim();
  const khoraBaseUrl = strFlag(flags, "khora-url")?.trim();
  const khoraAdmin = strFlag(flags, "khora-admin-token")?.trim();
  const relayBaseUrl = strFlag(flags, "relay-url")?.trim();
  const memoriesBaseUrl = strFlag(flags, "memories-url")?.trim();
  const memoriesAdmin = strFlag(flags, "memories-admin-token")?.trim();
  const chatBaseUrl = strFlag(flags, "chat-url")?.trim();
  const chatToken = strFlag(flags, "chat-token")?.trim();
  const chatChannelId = strFlag(flags, "chat-channel-id")?.trim();
  const identitySecret = strFlag(flags, "identity-secret")?.trim();

  return zAgentNetCliConfigPartial.parse({
    ...(dataDir ? { dataDir } : {}),
    khora: {
      ...(khoraBaseUrl ? { baseUrl: stripSlash(khoraBaseUrl) } : {}),
      ...(khoraAdmin ? { adminToken: khoraAdmin } : {}),
    },
    relay: {
      ...(relayBaseUrl ? { baseUrl: stripSlash(relayBaseUrl) } : {}),
    },
    memories: {
      ...(memoriesBaseUrl ? { baseUrl: stripSlash(memoriesBaseUrl) } : {}),
      ...(memoriesAdmin ? { adminToken: memoriesAdmin } : {}),
    },
    chat: {
      ...(chatBaseUrl ? { baseUrl: stripSlash(chatBaseUrl) } : {}),
      ...(chatToken ? { token: chatToken } : {}),
      ...(chatChannelId ? { channelId: chatChannelId } : {}),
    },
    ...(identitySecret ? { identitySecret } : {}),
  });
}

function readConfigFile(filePath: string): AgentNetCliConfigPartial {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return zAgentNetCliConfigPartial.parse(raw);
}

function mergePartial(
  base: AgentNetCliConfigPartial,
  overlay: AgentNetCliConfigPartial,
): AgentNetCliConfigPartial {
  return {
    dataDir: overlay.dataDir ?? base.dataDir,
    identitySecret: overlay.identitySecret ?? base.identitySecret,
    khora: {
      baseUrl: overlay.khora?.baseUrl ?? base.khora?.baseUrl,
      adminToken: overlay.khora?.adminToken ?? base.khora?.adminToken,
    },
    relay: {
      baseUrl: overlay.relay?.baseUrl ?? base.relay?.baseUrl,
    },
    memories: {
      baseUrl: overlay.memories?.baseUrl ?? base.memories?.baseUrl,
      adminToken: overlay.memories?.adminToken ?? base.memories?.adminToken,
    },
    chat: {
      baseUrl: overlay.chat?.baseUrl ?? base.chat?.baseUrl,
      token: overlay.chat?.token ?? base.chat?.token,
      channelId: overlay.chat?.channelId ?? base.chat?.channelId,
    },
  };
}

const REFERENCE_DEFAULTS: AgentNetCliConfigPartial = {
  khora: { baseUrl: DEFAULT_KHORA },
  relay: { baseUrl: DEFAULT_RELAY },
  memories: { baseUrl: DEFAULT_MEMORIES },
  chat: { baseUrl: DEFAULT_CHAT },
};

export type ResolvedCliConfig = {
  config: AgentNetCliConfig;
  configPath: string | null;
};

/**
 * Merge order: defaults → env → config file → flags (flags win).
 * Missing required tokens stay empty strings until validate/doctor.
 */
export function resolveCliConfig(
  flags: FlagMap,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCliConfig {
  const configPath = resolveConfigPath(flags, env);
  let merged: AgentNetCliConfigPartial = {
    dataDir: defaultDataDir(env),
    ...REFERENCE_DEFAULTS,
    memories: { baseUrl: DEFAULT_MEMORIES, adminToken: "" },
    chat: { baseUrl: DEFAULT_CHAT, token: "" },
  };
  merged = mergePartial(merged, configFromEnv(env));
  if (configPath !== null && existsSync(configPath)) {
    merged = mergePartial(merged, readConfigFile(configPath));
  }
  merged = mergePartial(merged, configFromFlags(flags));

  const candidate = {
    dataDir: expandHome(merged.dataDir ?? defaultDataDir(env)),
    khora: {
      baseUrl: merged.khora?.baseUrl ?? DEFAULT_KHORA,
      ...(merged.khora?.adminToken ? { adminToken: merged.khora.adminToken } : {}),
    },
    relay: {
      baseUrl: merged.relay?.baseUrl ?? DEFAULT_RELAY,
    },
    memories: {
      baseUrl: merged.memories?.baseUrl ?? DEFAULT_MEMORIES,
      adminToken: merged.memories?.adminToken ?? "",
    },
    chat: {
      baseUrl: merged.chat?.baseUrl ?? DEFAULT_CHAT,
      token: merged.chat?.token ?? "",
      ...(merged.chat?.channelId ? { channelId: merged.chat.channelId } : {}),
    },
    ...(merged.identitySecret ? { identitySecret: merged.identitySecret } : {}),
  };

  return {
    config: zAgentNetCliConfig.parse(candidate),
    configPath,
  };
}

export function redactConfig(config: AgentNetCliConfig): AgentNetCliConfig {
  return {
    ...config,
    khora: {
      ...config.khora,
      ...(config.khora.adminToken !== undefined ? { adminToken: "***" } : {}),
    },
    memories: {
      ...config.memories,
      adminToken: config.memories.adminToken.length > 0 ? "***" : "",
    },
    chat: {
      ...config.chat,
      token: config.chat.token.length > 0 ? "***" : "",
    },
    ...(config.identitySecret !== undefined ? { identitySecret: "***" } : {}),
  };
}
