import type { FlagMap } from "../lib/argv.ts";
import { handleDoctor } from "./doctor.ts";
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
  if (a === "version") {
    const { printVersion } = await import("./version.ts");
    printVersion(flags);
    return;
  }

  throw new Error(`Unknown command: ${positional.join(" ")}`);
}
