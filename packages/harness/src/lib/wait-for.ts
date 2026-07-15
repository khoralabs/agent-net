export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  opts: { timeoutMs?: number; pollMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 10_000, pollMs = 200, label = "condition" } = opts;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`waitFor timed out: ${label}`);
    await Bun.sleep(pollMs);
  }
}
