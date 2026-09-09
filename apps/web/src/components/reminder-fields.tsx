import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import type { Settings } from "@/lib/model";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** The one global reminder rule: how many days before, and at what time. */
export function ReminderFields({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="daysBefore">{t.settings.daysBefore}</Label>
        <select
          id="daysBefore"
          className={selectClass}
          value={settings.daysBefore}
          onChange={(e) => onChange({ daysBefore: Number(e.target.value) })}
        >
          <option value={0}>{t.settings.sameDay}</option>
          <option value={1}>{t.settings.dayBefore}</option>
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {t.settings.daysBeforeN(n)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timeOfDay">{t.settings.timeOfDay}</Label>
        <input
          id="timeOfDay"
          type="time"
          className={selectClass}
          value={settings.timeOfDay}
          onChange={(e) => e.target.value && onChange({ timeOfDay: e.target.value })}
        />
      </div>
    </div>
  );
}
