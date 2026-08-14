import { describe, expect, test } from "bun:test";
import { formatAgentStepContext, resolveAgentStepContext } from "./step-context.ts";

describe("formatAgentStepContext", () => {
  test("returns empty for undefined", () => {
    expect(formatAgentStepContext(undefined)).toEqual([]);
  });

  test("renders database, source, and turn — not namespace catalogs", () => {
    expect(
      formatAgentStepContext({
        database: {
          name: "Acme",
          about: "Company memory DB.",
          baseUnderstanding: "Sells widgets.",
        },
        namespaces: [
          { namespace: "notes", description: "Notes" },
          { namespace: "_skills_", alias: "Skills" },
        ],
        source: {
          sourceId: "conn-1",
          instructions: [
            "External source (CRM):",
            "Salesforce sync",
            "Ingest instructions:\nPrefer account names.",
            "Pull instructions:\nFocus on open deals.",
          ],
        },
        turn: { instructions: ["Respond concisely."] },
      }),
    ).toEqual([
      "This memory database is for: Acme.",
      "Company memory DB.",
      "Base understanding:\nSells widgets.",
      "External source (CRM):",
      "Salesforce sync",
      "Ingest instructions:\nPrefer account names.",
      "Pull instructions:\nFocus on open deals.",
      "Respond concisely.",
    ]);
  });

  test("ignores namespace catalog facet", () => {
    const namespaces = Array.from({ length: 42 }, (_, i) => ({
      namespace: `ns-${i}`,
    }));
    expect(formatAgentStepContext({ namespaces })).toEqual([]);
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
