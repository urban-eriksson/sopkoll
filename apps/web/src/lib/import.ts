import type { SvoaPickup } from "./api";
import { type Item, newId } from "./model";
import { binTypeFromGroup, nameFromGroup, parseFrequency } from "./schedule";

/** Turn an SVOA schedule into items, keeping ids of items already present. */
export function itemsFromSchedule(address: string, pickups: SvoaPickup[], existing: Item[] = []) {
  return pickups.map((p): Item => {
    const prev = existing.find((i) => i.source === "svoa" && i.group === p.group);
    const { intervalDays, seasonMonths } = parseFrequency(p.fetchFrequency);
    return {
      id: prev?.id ?? newId(),
      name: prev?.name ?? nameFromGroup(p.group),
      type: prev?.type ?? binTypeFromGroup(p.group),
      source: "svoa",
      address,
      group: p.group,
      frequencyText: p.fetchFrequency,
      intervalDays,
      seasonMonths,
      nextDate: p.executionDate,
      enabled: prev?.enabled ?? true,
    };
  });
}
