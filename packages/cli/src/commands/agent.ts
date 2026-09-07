import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { installMemoriesOntology } from "@khoralabs/agent-net/memories";
import { minimalAgentMemoriesOntology } from "@khoralabs/memories-service/client/agent";
import { z } from "zod";

import { withHarness } from "../context/with-harness.ts";
import type { FlagMap } from "../lib/argv.ts";
import { boolFlag, strFlag } from "../lib/argv.ts";
import { printJson } from "../lib/json-out.ts";

/** Minimal structural check for ontology JSON files. */
const zOntologyJson = z
  .object({
    nodeLabels: z.record(z.string(), z.unknown()).optional(),
    edgeLabels: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

async function loadOntology(flags: FlagMap) {
  const path = strFlag(flags, "ontology")?.trim();
  if (path === undefined || path.length === 0) {
    return minimalAgentMemoriesOntology;
  }
  if (path.endsWith(".json")) {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const parsed = zOntologyJson.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`invalid ontology JSON at ${path}: ${parsed.error.message}`);
    }
    return parsed.data as typeof minimalAgentMemoriesOntology;
  }
  const mod = (await import(pathToFileURL(path).href)) as {
    default?: typeof minimalAgentMemoriesOntology;
    ontology?: typeof minimalAgentMemoriesOntology;
  };
  const ontology = mod.ontology ?? mod.default;
  if (ontology === undefined) {
    throw new Error(`ontology module must export ontology or default: ${path}`);
  }
  return ontology;
}

export async function handleAgentSpawn(flags: FlagMap): Promise<void> {
  const ontology = await loadOntology(flags);
  installMemoriesOntology(ontology);
  const externalId = strFlag(flags, "external-id")?.trim();
  await withHarness(flags, async (harness) => {
    const agent = await harness.spawn({
      ontology,
      ...(externalId ? { externalId } : {}),
    });
    const out = { did: agent.did };
    if (boolFlag(flags, "json")) printJson(out);
    else console.log(agent.did);
  });
}

export async function handleAgentList(flags: FlagMap): Promise<void> {
  await withHarness(flags, async (harness) => {
    const dids = [...harness.agentDids];
    if (boolFlag(flags, "json")) printJson({ dids });
    else for (const did of dids) console.log(did);
  });
}

export async function handleAgentGet(flags: FlagMap): Promise<void> {
  const did = strFlag(flags, "did")?.trim();
  if (did === undefined || did.length === 0) throw new Error("--did is required");
  const ontology = await loadOntology(flags);
  installMemoriesOntology(ontology);
  await withHarness(flags, async (harness) => {
    const agent = await harness.get(did, { ontology });
    const out = {
      did: agent.did,
      hasMemories: agent.memories !== undefined,
      hasSocial: agent.social !== undefined,
    };
    if (boolFlag(flags, "json")) printJson(out);
    else console.log(`${out.did} memories=${out.hasMemories} social=${out.hasSocial}`);
  });
}

export async function handleAgentRemove(flags: FlagMap): Promise<void> {
  const did = strFlag(flags, "did")?.trim();
  if (did === undefined || did.length === 0) throw new Error("--did is required");
  await withHarness(flags, async (harness) => {
    await harness.removeAgent(did);
    if (boolFlag(flags, "json")) printJson({ ok: true, did });
    else console.log(`removed ${did}`);
  });
}
