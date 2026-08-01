import { describe, expect, test } from "bun:test";
import { defineOntology } from "@khoralabs/memories-node/ontology";
import { z } from "zod";

import { resolveHarnessMemoriesOntology } from "./memories-client.ts";
import { minimalHarnessMemoriesOntology } from "./minimal-ontology.ts";
import {
  memoryLinkSchema,
  nodeLabelsInputSchema,
  parseMemoryLinkRow,
} from "./ontology-tool-schema.ts";

const testOntology = resolveHarnessMemoriesOntology(
  defineOntology({
    nodeLabels: {
      fact: z.object({
        subject: z.string(),
        predicate: z.string(),
        object: z.string(),
        source: z.string().optional(),
      }),
      person: z.object({
        name: z.string(),
        role: z.string().optional(),
      }),
    },
    edgeLabels: {
      references: z.object({
        context: z.string().optional(),
      }),
      related: z.object({}),
    },
  }),
);

describe("ontology-tool-schema", () => {
  test("nodeLabelsInputSchema rejects invalid fact props and accepts subject/predicate/object", () => {
    const schema = nodeLabelsInputSchema(testOntology);
    expect(() => schema.parse({ fact: { term: "CFD", category: "marketing" } })).toThrow();
    expect(
      schema.parse({
        fact: {
          subject: "Coffee Fueled Dev",
          predicate: "is abbreviated as",
          object: "CFD",
        },
      }),
    ).toEqual({
      fact: {
        subject: "Coffee Fueled Dev",
        predicate: "is abbreviated as",
        object: "CFD",
      },
    });
  });

  test("memoryLinkSchema allows default edge kind and rejects two edge kinds", () => {
    const schema = memoryLinkSchema(testOntology);
    expect(schema.parse({ namespace: "_root_/platform/contacts", key: "zach" })).toMatchObject({
      namespace: "_root_/platform/contacts",
      key: "zach",
    });
    expect(() =>
      schema.parse({
        namespace: "n",
        key: "k",
        references: {},
        related: {},
      }),
    ).toThrow(/at most one/i);
  });

  test("parseMemoryLinkRow extracts edge kind props", () => {
    const link = parseMemoryLinkRow(
      {
        namespace: "notes",
        key: "peer",
        direction: "out",
        references: { context: "see also" },
      },
      testOntology,
    );
    expect(link).toEqual({
      namespace: "notes",
      key: "peer",
      direction: "out",
      label: "references",
      props: { context: "see also" },
    });
  });

  test("minimal ontology schemas still build", () => {
    expect(() => nodeLabelsInputSchema(minimalHarnessMemoriesOntology)).not.toThrow();
    expect(() => memoryLinkSchema(minimalHarnessMemoriesOntology)).not.toThrow();
  });
});
