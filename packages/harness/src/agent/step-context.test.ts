import { describe, expect, test } from "bun:test";
import {
  AGENT_STEP_NAMESPACE_CATALOG_CAP,
  formatAgentStepContext,
  resolveAgentStepContext,
} from "./step-context.ts";

describe("formatAgentStepContext", () => {
  test("returns empty for undefined", () => {
    expect(formatAgentStepContext(undefined)).toEqual([]);
  });

  test("renders database, namespaces, source, and turn", () => {
    expect(
      formatAgentStepContext({
        database: {
          name: "Acme",
          about: "Company memory DB.",
          baseUnderstanding: "Sells widgets.",
          groundingNamespaces: ["_root_/acme"],
        },
        namespaces: [
          { namespace: "_root_", description: "Root" },
          { namespace: "_root_/skills", alias: "Skills" },
        ],
        source: {
          sourceId: "conn-1",
          label: "CRM",
          about: "Salesforce sync",
          directives: "Prefer account names.",
          pullDirective: "Focus on open deals.",
        },
        turn: { instructions: ["Respond concisely."] },
      }),
    ).toEqual([
      "This memory database is for: Acme.",
      "Company memory DB.",
      "Base understanding:\nSells widgets.",
      "Also provided: durable grounding under _root_/acme — search there when needed.",
      "Namespaces:",
      "- _root_: Root",
      "- _root_/skills (Skills)",
      "External source (CRM):",
      "Salesforce sync",
      "Ingest directives:\nPrefer account names.",
      "Pull directive:\nFocus on open deals.",
      "Respond concisely.",
    ]);
  });

  test("notes truncated namespace catalog", () => {
    const namespaces = Array.from({ length: AGENT_STEP_NAMESPACE_CATALOG_CAP + 2 }, (_, i) => ({
      namespace: `_root_/ns-${i}`,
    }));
    const lines = formatAgentStepContext({ namespaces });
    expect(lines[0]).toBe(
      `Namespaces (showing ${AGENT_STEP_NAMESPACE_CATALOG_CAP} of ${namespaces.length}):`,
    );
    expect(lines.length).toBe(AGENT_STEP_NAMESPACE_CATALOG_CAP + 1);
  });
});

describe("resolveAgentStepContext", () => {
  test("maps legacy memoriesDatabase into stepContext.database", () => {
    const resolved = resolveAgentStepContext({
      memoriesDatabase: { about: "Legacy about" },
      turnInstructions: ["Be brief."],
    });
    expect(resolved).toEqual({
      database: { about: "Legacy about" },
      turn: { instructions: ["Be brief."] },
    });
  });
});
