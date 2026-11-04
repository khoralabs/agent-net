import { describe, expect, test } from "bun:test";
import {
  AGENT_NET_HTTP_PATH,
  discoverAgentNet,
  HOST_CAPABILITY,
} from "@khoralabs/agent-net/capabilities";
import { startAgentNetCapabilitiesService } from "./agent-net-capabilities.ts";

describe("startAgentNetCapabilitiesService", () => {
  test("publishes well-known discovery without credentials", async () => {
    const svc = startAgentNetCapabilitiesService({
      services: {
        khoraBaseUrl: "http://127.0.0.1:8788",
        memoriesBaseUrl: "http://127.0.0.1:8791",
        relayBaseUrl: "http://127.0.0.1:8790",
        chatBaseUrl: "http://127.0.0.1:8792",
      },
    });
    try {
      const discovery = await discoverAgentNet({ baseUrl: svc.baseUrl });
      expect(discovery.endpoints.wellKnown).toBe(AGENT_NET_HTTP_PATH.wellKnown);
      const ids = discovery.capabilities.map((c) => c.id).sort();
      expect(ids).toContain(HOST_CAPABILITY.khora);
      expect(ids).toContain(HOST_CAPABILITY.chat);
      expect(ids).toContain(HOST_CAPABILITY.negotiate);
      expect(JSON.stringify(discovery)).not.toContain("token");
      expect(JSON.stringify(discovery)).not.toContain("secret");

      const self = await fetch(`${svc.baseUrl}${AGENT_NET_HTTP_PATH.capabilitiesSelf}`);
      expect(self.status).toBe(401);
    } finally {
      svc.stop();
    }
  });
});
