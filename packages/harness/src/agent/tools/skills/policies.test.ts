import { describe, expect, test } from "bun:test";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import { harnessToolkit } from "../_toolkit.ts";
import { createEphemeralRecentNamespacesTracker } from "../memories/_helpers/recent-namespaces.ts";
import { emptyDisabledToolSets, type HarnessToolkitEnv } from "../types.ts";
import { SKILLS_NAMESPACE } from "./_helpers/skills.ts";
import { hasSkillsNamespace, skillsNamespaceExists } from "./policies.ts";

function createEnv(overrides: Partial<HarnessToolkitEnv> = {}): HarnessToolkitEnv {
  return {
    skills: [],
    activatedSkillNames: new Set(),
    embeddingCache: new Map(),
    recentNamespaces: createEphemeralRecentNamespacesTracker(),
    ...emptyDisabledToolSets(),
    ...overrides,
  };
}

function mockClient(namespaces: string[]): RemoteMemoriesClientAsync {
  return {
    persistence: {
      listMemoryNamespaces: async () => namespaces,
    },
  } as unknown as RemoteMemoriesClientAsync;
}

function mockClientWithMeta(
  rows: Array<{ namespace: string; suppressed?: boolean }>,
): RemoteMemoriesClientAsync {
  return {
    persistence: {
      listNamespacesWithMetadata: async () =>
        rows.map((row) => ({
          namespace: row.namespace,
          alias: null,
          description: "",
          ...(row.suppressed === true ? { suppressed: true as const } : {}),
        })),
    },
  } as unknown as RemoteMemoriesClientAsync;
}

describe("hasSkillsNamespace", () => {
  test("skillsNamespaceExists is true only when _skills_ is listed", async () => {
    await expect(skillsNamespaceExists(mockClient(["notes"]))).resolves.toBe(false);
    await expect(skillsNamespaceExists(mockClient([SKILLS_NAMESPACE]))).resolves.toBe(true);
  });

  test("skillsNamespaceExists is false when _skills_ is suppressed", async () => {
    await expect(
      skillsNamespaceExists(
        mockClientWithMeta([{ namespace: SKILLS_NAMESPACE, suppressed: true }]),
      ),
    ).resolves.toBe(false);
    await expect(
      skillsNamespaceExists(mockClientWithMeta([{ namespace: SKILLS_NAMESPACE }])),
    ).resolves.toBe(true);
  });

  test("policy fails without memories client", async () => {
    await expect(hasSkillsNamespace.evaluate(createEnv())).resolves.toBe(false);
  });

  test("skills tools are hidden when _skills_ is missing", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({ memoriesClient: mockClient(["notes"]) }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchSkills).toBeUndefined();
    expect(typed.writeSkill).toBeUndefined();
    expect(typed.activateSkill).toBeUndefined();
  });

  test("skills tools are hidden when _skills_ is suppressed", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({
        memoriesClient: mockClientWithMeta([{ namespace: SKILLS_NAMESPACE, suppressed: true }]),
      }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchSkills).toBeUndefined();
    expect(typed.writeSkill).toBeUndefined();
  });

  test("skills tools are visible when _skills_ exists", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({ memoriesClient: mockClient([SKILLS_NAMESPACE]) }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchSkills).toBeDefined();
    expect(typed.writeSkill).toBeDefined();
    expect(typed.activateSkill).toBeDefined();
  });
});
