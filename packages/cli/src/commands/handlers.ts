import type { FlagMap } from "../lib/argv.ts";
import { handleAgentGet, handleAgentList, handleAgentRemove, handleAgentSpawn } from "./agent.ts";
import { handleDoctor } from "./doctor.ts";
import { handleInboxWatch } from "./inbox.ts";
import { handleConfigSet, handleConfigShow, handleSetup } from "./setup.ts";

export async function dispatch(positional: string[], flags: FlagMap): Promise<void> {
  const [a, b] = positional;

  if (a === "setup") {
    await handleSetup(flags);
    return;
  }
  if (a === "config" && b === "show") {
    await handleConfigShow(flags);
    return;
  }
  if (a === "config" && b === "set") {
    await handleConfigSet(flags);
    return;
  }
  if (a === "doctor") {
    await handleDoctor(flags);
    return;
  }
  if (a === "agent" && b === "spawn") {
    await handleAgentSpawn(flags);
    return;
  }
  if (a === "agent" && b === "list") {
    await handleAgentList(flags);
    return;
  }
  if (a === "agent" && b === "get") {
    await handleAgentGet(flags);
    return;
  }
  if (a === "agent" && b === "remove") {
    await handleAgentRemove(flags);
    return;
  }
  if (a === "inbox" && b === "watch") {
    await handleInboxWatch(flags);
    return;
  }
  if (a === "skills" && b === "install") {
    const { handleSkillsInstall } = await import("./skills.ts");
    await handleSkillsInstall(flags);
    return;
  }
  if (a === "version") {
    const { printVersion } = await import("./version.ts");
    printVersion(flags);
    return;
  }

  throw new Error(`Unknown command: ${positional.join(" ")}`);
}
