/** Stable toolkit `name` values used by harness composables and disable lists. */
export const HARNESS_TOOLKIT = {
  memories: "memories",
  skills: "skills",
  khora: "khora-network",
  chat: "harness-chat",
  nbc: "nbc-protocol",
} as const;

export type HarnessToolkitId = (typeof HARNESS_TOOLKIT)[keyof typeof HARNESS_TOOLKIT];
