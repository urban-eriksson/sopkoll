import type { BinType, Item, Settings } from "./model";

/**
 * SVOA returns only the *next* pickup per bin plus a frequency in free text
 * ("Varannan vecka", "Var 4:e vecka", "Varannan vecka (april-nov)"). Everything
 * beyond that date is our extrapolation, corrected whenever the schedule is
 * refreshed — holidays shift pickups, and the refresh is what catches that.
 */

const MONTHS_SV = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

export function parseFrequency(text: string): { intervalDays: number; seasonMonths?: number[] } {
  const t = text.toLowerCase();
  let intervalDays = 14;
  if (/varje vecka|en gång i veckan/.test(t)) intervalDays = 7;
  else if (/varannan/.test(t)) intervalDays = 14;
  else {
    const m = t.match(/var\s+(\d+):?[ae]?\s+vecka/);
    if (m) intervalDays = Number(m[1]) * 7;
  }
  const season = t.match(/\(([a-zåäö]+)\s*[-–]\s*([a-zåäö]+)\)/);
  if (season) {
    const from = monthIndex(season[1]);
    const to = monthIndex(season[2]);
    if (from && to) {
      const months: number[] = [];
      for (let m = from; ; m = (m % 12) + 1) {
        months.push(m);
        if (m === to) break;
        if (months.length > 12) break;
      }
      return { intervalDays, seasonMonths: months };
    }
  }
  return { intervalDays };
}

function monthIndex(name: string): number | null {
  const i = MONTHS_SV.findIndex((m) => name.startsWith(m));
  return i === -1 ? null : i + 1;
}

/** Map SVOA's group name to a lid. Unknown groups get the neutral brown. */
export function binTypeFromGroup(group: string): BinType {
  const g = group.toLowerCase();
  const rest = /rest/.test(g);
  const mat = /mat/.test(g);
  const papper = /papper|kartong|tidning/.test(g);
  const plast = /plast/.test(g);
  const glas = /glas/.test(g);
  const metall = /metall/.test(g);
  if (/trädgård|tradgard/.test(g)) return "tradgard";
  if (rest && mat) return "restmat";
  if (papper && plast) return "papperplast";
  if (glas && metall) return "glasmetall";
  if (rest) return "rest";
  if (mat) return "mat";
  if (papper) return "papper";
  if (plast) return "plast";
  if (glas) return "glas";
  if (metall) return "metall";
  return "other";
}

/** "Kärl 1 - restavfall och matavfall" → "Restavfall och matavfall". */
export function nameFromGroup(group: string): string {
  const stripped = group.replace(/^kärl\s*\d+\s*[-–:]\s*/i, "").replace(/,\s*villa$/i, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function inSeason(d: Date, months?: number[]): boolean {
  return !months || months.includes(d.getMonth() + 1);
}

/**
 * Next `count` pickup dates on or after `today`, stepping from the item's known
 * next date by its interval and skipping out-of-season dates. Returns ISO dates.
 */
export function upcomingDates(item: Item, today: Date, count = 3): string[] {
  const start = fromISODate(item.nextDate);
  const t0 = fromISODate(toISODate(today));
  const out: string[] = [];
  const step = Math.max(1, item.intervalDays);
  let d = start;
  // Roll forward if the stored date is in the past, keeping phase.
  if (d < t0) {
    const behind = Math.ceil((t0.getTime() - d.getTime()) / (step * 86_400_000));
    d = addDays(d, behind * step);
  }
  // Season gaps can be long; bound the search to two years.
  for (let i = 0; out.length < count && i < (730 / step) * 2 + count; i++) {
    if (inSeason(d, item.seasonMonths)) out.push(toISODate(d));
    d = addDays(d, step);
  }
  return out;
}

export function nextDate(item: Item, today: Date): string | null {
  return upcomingDates(item, today, 1)[0] ?? null;
}

/** When the reminder for a given pickup fires, as a local Date. */
export function reminderAt(pickupISO: string, settings: Settings): Date {
  const [h, m] = settings.timeOfDay.split(":").map(Number);
  const d = addDays(fromISODate(pickupISO), -settings.daysBefore);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function daysUntil(pickupISO: string, today: Date): number {
  const a = fromISODate(toISODate(today)).getTime();
  const b = fromISODate(pickupISO).getTime();
  return Math.round((b - a) / 86_400_000);
}
