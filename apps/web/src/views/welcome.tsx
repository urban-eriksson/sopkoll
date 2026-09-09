import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AddressField } from "@/components/address-field";
import { BinIcon } from "@/components/bin-icon";
import { Page } from "@/components/page";
import { ReminderFields } from "@/components/reminder-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { fetchSchedule } from "@/lib/api";
import { formatLong } from "@/lib/format";
import { t } from "@/lib/i18n";
import { itemsFromSchedule } from "@/lib/import";
import type { Item } from "@/lib/model";
import { store, useStore } from "@/lib/store";

type Step =
  | { n: 1; address: string | null; busy: boolean; error: string | null }
  | { n: 2; address: string; candidates: Item[]; chosen: Set<string> }
  | { n: 3 };

const TOTAL = 3;

/**
 * First run: address → which bins → reminder rule. Every step is skippable and
 * the manual escape hatch is always one tap away, because SVOA has nothing for
 * apartment buildings and those households still have bins to remember.
 */
export function Welcome({ changeAddress = false }: { changeAddress?: boolean }) {
  const navigate = useNavigate();
  const { settings, items } = useStore();
  const [step, setStep] = useState<Step>({
    n: 1,
    address: changeAddress ? null : (settings.address ?? null),
    busy: false,
    error: null,
  });

  async function lookup(address: string) {
    setStep({ n: 1, address, busy: true, error: null });
    try {
      const pickups = await fetchSchedule(address);
      if (pickups.length === 0) {
        setStep({ n: 1, address, busy: false, error: t.welcome.noSchedule });
        return;
      }
      const candidates = itemsFromSchedule(address, pickups, items);
      setStep({ n: 2, address, candidates, chosen: new Set(candidates.map((c) => c.id)) });
    } catch {
      setStep({ n: 1, address, busy: false, error: t.welcome.lookupFailed });
    }
  }

  function saveBins(s: Extract<Step, { n: 2 }>) {
    store.replaceSvoaItems(
      s.address,
      s.candidates.filter((c) => s.chosen.has(c.id)),
    );
    if (changeAddress) navigate("/app");
    else setStep({ n: 3 });
  }

  function finish() {
    store.setOnboarded();
    navigate("/app");
  }

  return (
    <Page back={changeAddress}>
      <p className="text-sm font-medium text-muted-foreground">{t.welcome.step(step.n, TOTAL)}</p>

      {step.n === 1 ? (
        <section className="mt-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t.welcome.addressTitle}</h1>
          <p className="mt-2 text-base text-muted-foreground">{t.welcome.addressHelp}</p>
          <div className="mt-6">
            <AddressField
              id="address"
              label={t.welcome.addressLabel}
              placeholder={t.welcome.addressPlaceholder}
              defaultValue={step.address ?? undefined}
              onPick={(address) => setStep({ n: 1, address, busy: false, error: null })}
            />
          </div>
          {step.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {step.error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled={!step.address || step.busy}
              onClick={() => step.address && lookup(step.address)}
            >
              {step.busy ? (
                <>
                  <Spinner /> {t.welcome.searching}
                </>
              ) : (
                t.welcome.save
              )}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/items/new">{t.welcome.manualInstead}</Link>
            </Button>
          </div>
          {!changeAddress ? (
            <button
              type="button"
              onClick={finish}
              className="mt-8 text-sm text-muted-foreground underline"
            >
              {t.welcome.skip}
            </button>
          ) : null}
        </section>
      ) : null}

      {step.n === 2 ? (
        <section className="mt-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t.welcome.pickTitle}</h1>
          <p className="mt-2 text-base text-muted-foreground">{t.welcome.pickHelp}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {step.candidates.map((c) => {
              const on = step.chosen.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    htmlFor={`bin-${c.id}`}
                    className="flex cursor-pointer items-center gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
                  >
                    <Checkbox
                      id={`bin-${c.id}`}
                      checked={on}
                      onCheckedChange={(v) => {
                        const chosen = new Set(step.chosen);
                        if (v) chosen.add(c.id);
                        else chosen.delete(c.id);
                        setStep({ ...step, chosen });
                      }}
                    />
                    <BinIcon type={c.type} className="size-11" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-heading text-base font-semibold">{c.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {c.frequencyText} · nästa {formatLong(c.nextDate)}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-6">
            <Button size="lg" onClick={() => saveBins(step)}>
              {t.welcome.save}
            </Button>
          </div>
        </section>
      ) : null}

      {step.n === 3 ? (
        <section className="mt-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t.welcome.reminderTitle}</h1>
          <p className="mt-2 text-base text-muted-foreground">{t.welcome.reminderHelp}</p>
          <div className="mt-6">
            <ReminderFields settings={settings} onChange={(p) => store.setSettings(p)} />
          </div>
          <div className="mt-8">
            <Button size="lg" onClick={finish}>
              {t.welcome.done}
            </Button>
          </div>
        </section>
      ) : null}
    </Page>
  );
}
