export type CalendarDate = { year: number; month: number; day: number };

function partsAt(instant: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
}

export function businessDateAt(instant: Date, timeZone: string): CalendarDate {
  const parts = partsAt(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function localMidnightAsUtc({ year, month, day }: CalendarDate, timeZone: string): Date {
  new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
  const desired = Date.UTC(year, month - 1, day);
  let guess = desired;
  for (let i = 0; i < 4; i++) {
    const parts = partsAt(new Date(guess), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const adjustment = desired - represented;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}

export function businessDayBounds(instant: Date, timeZone: string): { start: Date; end: Date } {
  const date = businessDateAt(instant, timeZone);
  const start = localMidnightAsUtc(date, timeZone);
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  const end = localMidnightAsUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }, timeZone);
  return { start, end };
}

export function businessDateKey(instant: Date, timeZone: string): string {
  const date = businessDateAt(instant, timeZone);
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function businessDayRange(instant: Date, timeZone: string, days: number): { start: Date; end: Date } {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new RangeError("days must be an integer from 1 to 90");
  const today = businessDateAt(instant, timeZone);
  const startCalendarDay = new Date(Date.UTC(today.year, today.month - 1, today.day - (days - 1)));
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return {
    start: localMidnightAsUtc({ year: startCalendarDay.getUTCFullYear(), month: startCalendarDay.getUTCMonth() + 1, day: startCalendarDay.getUTCDate() }, timeZone),
    end: localMidnightAsUtc({ year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate() }, timeZone),
  };
}
