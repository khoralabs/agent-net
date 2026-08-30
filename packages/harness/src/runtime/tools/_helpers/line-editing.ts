export type LineTuple = [lineNumber: number, content: string];

export function readLines(content: string): LineTuple[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  return lines.map((line, index) => [index + 1, line]);
}

export function applyLineChanges(content: string, changes: LineTuple[]): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const lineCount = lines.length;
  const seen = new Set<number>();

  for (const [lineNumber, newContent] of changes) {
    if (!Number.isInteger(lineNumber)) {
      throw new Error(`line ${lineNumber} must be an integer`);
    }
    if (lineNumber < 1 || lineNumber > lineCount) {
      throw new Error(`line ${lineNumber} is out of range (1-${lineCount})`);
    }
    if (seen.has(lineNumber)) {
      throw new Error(`duplicate change for line ${lineNumber}`);
    }
    seen.add(lineNumber);
    lines[lineNumber - 1] = newContent;
  }

  return lines.join("\n");
}
