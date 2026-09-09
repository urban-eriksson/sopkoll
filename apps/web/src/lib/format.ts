import { daysUntil, fromISODate } from "./schedule";

const long = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" });
const short = new Intl.DateTimeFormat("sv-SE", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Swedish keeps weekdays and months lowercase; only a sentence start is capitalised. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatLong(iso: string): string {
  return long.format(fromISODate(iso));
}

export function formatShort(iso: string): string {
  return short.format(fromISODate(iso)).replace(/\.$/, "");
}

export function relative(iso: string, today: Date): string {
  const n = daysUntil(iso, today);
  if (n <= 0) return "idag";
  if (n === 1) return "imorgon";
  return `om ${n} dagar`;
}

export function frequencyLabel(intervalDays: number, seasonMonths?: number[]): string {
  let s: string;
  if (intervalDays === 7) s = "Varje vecka";
  else if (intervalDays === 14) s = "Varannan vecka";
  else if (intervalDays % 7 === 0) s = `Var ${intervalDays / 7}:e vecka`;
  else s = `Var ${intervalDays}:e dag`;
  if (seasonMonths && seasonMonths.length < 12) {
    const names = [
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
    s += ` (${names[seasonMonths[0] - 1]}–${names[seasonMonths[seasonMonths.length - 1] - 1]})`;
  }
  return s;
}
