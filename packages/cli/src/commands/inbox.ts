import { withHarness } from "../context/with-harness.ts";
import type { FlagMap } from "../lib/argv.ts";
import { boolFlag } from "../lib/argv.ts";

export async function handleInboxWatch(flags: FlagMap): Promise<void> {
  const asJson = boolFlag(flags, "json");
  await withHarness(flags, async (harness) => {
    if (!asJson) {
      console.error("inbox watch: streaming events (Ctrl-C to stop)");
    }
    const unsub = harness.subscribeInbox((event) => {
      console.log(JSON.stringify(event));
    });
    await new Promise<void>((resolve) => {
      const onSignal = () => {
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        unsub();
        resolve();
      };
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
    });
  });
}
