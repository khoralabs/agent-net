import { describe, expect, test } from "bun:test";
import { evaluateComposable } from "@khoralabs/agent-capabilities";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service/client";

import { harnessToolkit } from "../../../runtime/tools/_toolkit.ts";
import { emptyDisabledToolSets, type HarnessToolkitEnv } from "../../../runtime/tools/types.ts";
import { createEphemeralRecentNamespacesTracker } from "../tools/_helpers/recent-namespaces.ts";
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

function mockClient(exists: boolean): RemoteMemoriesClientAsync {
  return {
    persistence: {
      namespaceExistsUnderPrefix: async () => exists,
    },
  } as unknown as RemoteMemoriesClientAsync;
}

describe("hasSkillsNamespace", () => {
  test("skillsNamespaceExists follows namespaceExistsUnderPrefix", async () => {
    await expect(skillsNamespaceExists(mockClient(false))).resolves.toBe(false);
    await expect(skillsNamespaceExists(mockClient(true))).resolves.toBe(true);
  });

  test("skillsNamespaceExists is false when exists API is missing", async () => {
    const client = { persistence: {} } as unknown as RemoteMemoriesClientAsync;
    await expect(skillsNamespaceExists(client)).resolves.toBe(false);
  });

  test("policy fails without memories client", async () => {
    await expect(hasSkillsNamespace.evaluate(createEnv())).resolves.toBe(false);
  });

  test("skills tools are hidden when _skills_ is missing", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({ memoriesClient: mockClient(false) }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchSkills).toBeUndefined();
    expect(typed.writeSkill).toBeUndefined();
    expect(typed.activateSkill).toBeUndefined();
  });

  test("skills tools are visible when _skills_ exists", async () => {
    const { tools } = await evaluateComposable(harnessToolkit, {
      env: createEnv({ memoriesClient: mockClient(true) }),
    });
    const typed = tools as Record<string, unknown>;
    expect(typed.searchSkills).toBeDefined();
    expect(typed.writeSkill).toBeDefined();
    expect(typed.activateSkill).toBeDefined();
  });
});
