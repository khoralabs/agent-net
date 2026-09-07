export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
