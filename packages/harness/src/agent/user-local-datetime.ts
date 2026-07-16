export type UserLocalDateTimeContext = {
  timeZone: string;
  formatted: string;
  utcInstant: string;
};

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveUserTimeZone(timeZone: string | undefined | null): string {
  if (timeZone != null) {
    const trimmed = timeZone.trim();
    if (trimmed.length > 0 && isValidIanaTimeZone(trimmed)) return trimmed;
  }
  return "UTC";
}

export function buildUserLocalDateTimeContext(
  timeZone: string | undefined | null,
  now = new Date(),
): UserLocalDateTimeContext {
  const resolved = resolveUserTimeZone(timeZone);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: resolved,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return {
    timeZone: resolved,
    formatted,
    utcInstant: now.toISOString(),
  };
}

export function formatUserLocalDateTimeInstruction(context: UserLocalDateTimeContext): string {
  return `The stakeholder's current local date and time is ${context.formatted} (${context.timeZone}). Use this when interpreting relative time references such as "today", "now", or "this week".`;
}
