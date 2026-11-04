/** HTTP path constants for agent-net capability discovery. */
export const AGENT_NET_HTTP_PATH = {
  wellKnown: "/.well-known/agent-net",
  health: "/health",
  capabilitiesSelf: "/v1/capabilities/self",
} as const;

export type AgentNetHttpPath = (typeof AGENT_NET_HTTP_PATH)[keyof typeof AGENT_NET_HTTP_PATH];
