/** Thrown when a command already printed its failure output (e.g. --json report). */
export class CommandExitError extends Error {
  readonly alreadyPrinted: boolean;

  constructor(message: string, opts?: { alreadyPrinted?: boolean }) {
    super(message);
    this.name = "CommandExitError";
    this.alreadyPrinted = opts?.alreadyPrinted ?? false;
  }
}
