import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { BinIcon } from "@/components/bin-icon";
import { Page } from "@/components/page";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n";
import { BIN_TYPES, type BinType, type Item, newId } from "@/lib/model";
import { toISODate } from "@/lib/schedule";
import { store, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const SEASON = [4, 5, 6, 7, 8, 9, 10, 11];
const selectClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Add or edit one bin. Manual bins own their whole schedule; SVOA bins keep
 * their date and interval read-only, since the nightly refresh would overwrite
 * any edit — the user can still rename, recolour, or pause them.
 */
export function ItemForm() {
  const { id } = useParams();
  const { items } = useStore();
  const existing = id ? items.find((i) => i.id === id) : undefined;
  if (id && !existing) return <Navigate to="/app" replace />;
  return <Form key={existing?.id ?? "new"} existing={existing} />;
}

function Form({ existing }: { existing?: Item }) {
  const navigate = useNavigate();
  const svoa = existing?.source === "svoa";
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<BinType>(existing?.type ?? "rest");
  const [nextDate, setNextDate] = useState(existing?.nextDate ?? toISODate(new Date()));
  const presetOf = (n: number) => ([7, 14, 28].includes(n) ? String(n) : "custom");
  const [preset, setPreset] = useState(presetOf(existing?.intervalDays ?? 14));
  const [customDays, setCustomDays] = useState(String(existing?.intervalDays ?? 14));
  const [season, setSeason] = useState(Boolean(existing?.seasonMonths));
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const intervalDays = preset === "custom" ? Math.max(1, Number(customDays) || 1) : Number(preset);
  const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(nextDate);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    store.upsertItem({
      id: existing?.id ?? newId(),
      source: existing?.source ?? "manual",
      address: existing?.address,
      group: existing?.group,
      frequencyText: existing?.frequencyText,
      name: name.trim(),
      type,
      nextDate,
      intervalDays,
      seasonMonths: season ? SEASON : undefined,
      enabled,
    });
    navigate("/app");
  }

  return (
    <Page back>
      <h1 className="text-3xl font-semibold tracking-tight">
        {existing ? t.item.editTitle : t.item.newTitle}
      </h1>
      {svoa ? <p className="mt-2 text-sm text-muted-foreground">{t.item.fromSvoa}</p> : null}

      <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">{t.item.name}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.item.namePlaceholder}
            required
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[0.95rem] font-medium">{t.item.type}</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {BIN_TYPES.map((bt) => (
              <button
                key={bt}
                type="button"
                aria-pressed={type === bt}
                onClick={() => setType(bt)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl bg-card p-3 text-center text-xs ring-1 ring-foreground/10 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  type === bt ? "bg-secondary ring-2 ring-primary" : "hover:bg-muted",
                )}
              >
                <BinIcon type={bt} className="size-10" />
                <span className="leading-tight">{t.bins[bt]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextDate">{t.item.nextDate}</Label>
            <input
              id="nextDate"
              type="date"
              className={selectClass}
              value={nextDate}
              disabled={svoa}
              onChange={(e) => setNextDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interval">{t.item.interval}</Label>
            <select
              id="interval"
              className={selectClass}
              value={preset}
              disabled={svoa}
              onChange={(e) => setPreset(e.target.value)}
            >
              <option value="7">{t.item.every7}</option>
              <option value="14">{t.item.every14}</option>
              <option value="28">{t.item.every28}</option>
              <option value="custom">{t.item.custom}</option>
            </select>
          </div>
        </div>

        {preset === "custom" && !svoa ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customDays">{t.item.customDays}</Label>
            <Input
              id="customDays"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
            />
          </div>
        ) : null}

        {!svoa ? (
          <label htmlFor="season" className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[0.95rem] font-medium">{t.item.season}</span>
              <span className="block text-sm text-muted-foreground">{t.item.seasonHelp}</span>
            </span>
            <Switch id="season" checked={season} onCheckedChange={setSeason} />
          </label>
        ) : null}

        <label htmlFor="enabled" className="flex items-center justify-between gap-4">
          <span className="text-[0.95rem] font-medium">{t.item.enabled}</span>
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" size="lg" disabled={!valid}>
            {existing ? t.item.save : t.item.create}
          </Button>
          {existing ? (
            <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>
              {t.item.delete}
            </Button>
          ) : null}
        </div>
      </form>

      {existing ? (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t.item.deleteTitle(existing.name)}</AlertDialogTitle>
              <AlertDialogDescription>{t.item.deleteBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.item.cancel}</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={() => {
                  store.removeItem(existing.id);
                  navigate("/app");
                }}
              >
                {t.item.delete}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </Page>
  );
}
