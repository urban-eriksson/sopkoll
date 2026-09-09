/**
 * The bins ("kärl") a household puts out, and the one global reminder rule.
 *
 * Items are independent, like routes in bike-my-day: each carries its own
 * schedule and, when imported from Stockholm Vatten och Avfall (SVOA), the
 * address it came from — so a second address later is a data change, not a
 * model change.
 */

/** Lid colour + glyph. Combined types mirror SVOA's shared bins (Kärl 1–3). */
export type BinType =
  | "rest"
  | "mat"
  | "restmat"
  | "papper"
  | "plast"
  | "papperplast"
  | "glas"
  | "metall"
  | "glasmetall"
  | "tradgard"
  | "other";

export const BIN_TYPES: BinType[] = [
  "restmat",
  "papperplast",
  "glasmetall",
  "tradgard",
  "rest",
  "mat",
  "papper",
  "plast",
  "glas",
  "metall",
  "other",
];

export interface Item {
  id: string;
  name: string;
  type: BinType;
  source: "svoa" | "manual";
  /** SVOA address value, e.g. "Nockebyvägen 15, Bromma, 167 71". */
  address?: string;
  /** SVOA group name, kept verbatim so a refresh can match it. */
  group?: string;
  frequencyText?: string;
  intervalDays: number;
  /** 1–12. Absent = all year. */
  seasonMonths?: number[];
  /** ISO date (YYYY-MM-DD) of the next known pickup. */
  nextDate: string;
  enabled: boolean;
}

export interface Settings {
  /** 0 = same day. */
  daysBefore: number;
  /** "HH:MM", local Stockholm time. */
  timeOfDay: string;
  address?: string;
}

export const DEFAULT_SETTINGS: Settings = { daysBefore: 1, timeOfDay: "19:00" };

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
