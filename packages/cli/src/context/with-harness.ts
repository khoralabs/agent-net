import {
  type NetworkHarnessHandle,
  parseIdentityWrapKey,
  startNetworkHarness,
  wrapKeySecretFromBytes,
} from "@khoralabs/agent-net";

import { resolveCliConfig } from "../config/load.ts";
import { assertHarnessTokens } from "../config/schema.ts";
import type { FlagMap } from "../lib/argv.ts";

export type WithHarnessDeps = {
  start: typeof startNetworkHarness;
};

export async function withHarness<T>(
  flags: FlagMap,
  fn: (harness: NetworkHarnessHandle) => Promise<T>,
  deps: WithHarnessDeps = { start: startNetworkHarness },
): Promise<T> {
  const { config } = resolveCliConfig(flags);
  assertHarnessTokens(config);
  const harness = await deps.start({
    dataDir: config.dataDir,
    khoraBaseUrl: config.khora.baseUrl,
    relayBaseUrl: config.relay.baseUrl,
    memoriesBaseUrl: config.memories.baseUrl,
    memoriesAdminToken: config.memories.adminToken,
    chatBaseUrl: config.chat.baseUrl,
    chatToken: config.chat.token,
    ...(config.chat.channelId ? { chatChannelId: config.chat.channelId } : {}),
    ...(config.khora.adminToken ? { khoraAdminToken: config.khora.adminToken } : {}),
    ...(config.identitySecret
      ? { identitySecret: wrapKeySecretFromBytes(parseIdentityWrapKey(config.identitySecret)) }
      : {}),
  });
  try {
    return await fn(harness);
  } finally {
    harness.stop();
  }
}
