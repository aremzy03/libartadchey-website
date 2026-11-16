export type DayItem = {
  dateKey: string; // YYYY-MM-DD
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  fullLabel: string;
};

export function buildDayWindow(
  startOffsetDays: number,
  count: number,
): DayItem[] {
  const days: DayItem[] = [];
  const now = new Date();
  const baseUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  for (let i = 0; i < count; i += 1) {
    const d = new Date(baseUtc);
    d.setUTCDate(baseUtc.getUTCDate() + startOffsetDays + i);
    const dateKey = d.toISOString().slice(0, 10);

    const weekdayShort = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      timeZone: "UTC",
    }).format(d);
    const dayNumber = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      timeZone: "UTC",
    }).format(d);
    const monthShort = new Intl.DateTimeFormat("en-GB", {
      month: "short",
      timeZone: "UTC",
    }).format(d);
    const fullLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(d);

    days.push({
      dateKey,
      weekdayShort,
      dayNumber,
      monthShort,
      fullLabel,
    });
  }

  return days;
}
