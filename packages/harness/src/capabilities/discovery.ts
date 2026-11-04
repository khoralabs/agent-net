import {
  type AgentNetDiscovery,
  type AgentNetHostManifest,
  zAgentNetDiscovery,
} from "./manifest.ts";

/**
 * Validate and return the public discovery document for `GET /.well-known/agent-net`.
 * The manifest must not contain credentials or internal service URLs.
 */
export function buildAgentNetDiscovery(manifest: AgentNetHostManifest): AgentNetDiscovery {
  return zAgentNetDiscovery.parse(manifest);
}
