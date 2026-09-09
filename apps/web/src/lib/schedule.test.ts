import { describe, expect, it } from "vitest";
import type { Item } from "./model";
import {
  binTypeFromGroup,
  daysUntil,
  nameFromGroup,
  parseFrequency,
  reminderAt,
  upcomingDates,
} from "./schedule";

const base: Item = {
  id: "x",
  name: "Test",
  type: "rest",
  source: "manual",
  intervalDays: 14,
  nextDate: "2026-09-21",
  enabled: true,
};

describe("parseFrequency", () => {
  it("reads the SVOA phrasings", () => {
    expect(parseFrequency("Varannan vecka")).toEqual({ intervalDays: 14 });
    expect(parseFrequency("Var 4:e vecka")).toEqual({ intervalDays: 28 });
    expect(parseFrequency("Varje vecka")).toEqual({ intervalDays: 7 });
    expect(parseFrequency("Varannan vecka (april-nov)")).toEqual({
      intervalDays: 14,
      seasonMonths: [4, 5, 6, 7, 8, 9, 10, 11],
    });
  });
  it("falls back to every other week", () => {
    expect(parseFrequency("okänt")).toEqual({ intervalDays: 14 });
  });
});

describe("binTypeFromGroup", () => {
  it("maps the SVOA groups", () => {
    expect(binTypeFromGroup("Kärl 1 - restavfall och matavfall")).toBe("restmat");
    expect(binTypeFromGroup("Kärl 2 - papper och plast")).toBe("papperplast");
    expect(binTypeFromGroup("Kärl 3 - glas och metall")).toBe("glasmetall");
    expect(binTypeFromGroup("Trädgårdsavfall, villa")).toBe("tradgard");
    expect(binTypeFromGroup("Något annat")).toBe("other");
  });
  it("names them without the Kärl prefix", () => {
    expect(nameFromGroup("Kärl 2 - papper och plast")).toBe("Papper och plast");
    expect(nameFromGroup("Trädgårdsavfall, villa")).toBe("Trädgårdsavfall");
  });
});

describe("upcomingDates", () => {
  it("steps from the known date", () => {
    expect(upcomingDates(base, new Date(2026, 8, 9))).toEqual([
      "2026-09-21",
      "2026-10-05",
      "2026-10-19",
    ]);
  });
  it("rolls a stale date forward, keeping phase", () => {
    expect(upcomingDates(base, new Date(2026, 9, 6), 2)).toEqual(["2026-10-19", "2026-11-02"]);
  });
  it("includes today", () => {
    expect(upcomingDates(base, new Date(2026, 8, 21), 1)).toEqual(["2026-09-21"]);
  });
  it("skips out-of-season dates", () => {
    const garden = { ...base, seasonMonths: [4, 5, 6, 7, 8, 9, 10, 11], nextDate: "2026-11-23" };
    expect(upcomingDates(garden, new Date(2026, 10, 20), 2)).toEqual(["2026-11-23", "2027-04-12"]);
  });
});

describe("reminderAt", () => {
  it("fires the evening before by default", () => {
    const at = reminderAt("2026-09-21", { daysBefore: 1, timeOfDay: "19:00" });
    expect(at.getDate()).toBe(20);
    expect(at.getHours()).toBe(19);
  });
  it("counts whole days", () => {
    expect(daysUntil("2026-09-21", new Date(2026, 8, 9, 23, 59))).toBe(12);
  });
});
