import { useState } from "react";
import { Link } from "react-router";
import { Page } from "@/components/page";
import { PushToggle } from "@/components/push-toggle";
import { ReminderFields } from "@/components/reminder-fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchSchedule } from "@/lib/api";
import { t } from "@/lib/i18n";
import { itemsFromSchedule } from "@/lib/import";
import { reminderAt, upcomingDates } from "@/lib/schedule";
import { store, useStore } from "@/lib/store";
import { useToday } from "@/lib/use-today";

const whenFmt = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function SettingsView() {
  const { settings, items } = useStore();
  const today = useToday();
  const [refresh, setRefresh] = useState<"idle" | "busy" | "ok" | "failed">("idle");

  const soonest = items
    .filter((i) => i.enabled)
    .flatMap((i) => upcomingDates(i, today, 1))
    .sort()[0];

  async function refreshSchedule() {
    if (!settings.address) return;
    setRefresh("busy");
    try {
      const pickups = await fetchSchedule(settings.address);
      store.replaceSvoaItems(settings.address, itemsFromSchedule(settings.address, pickups, items));
      setRefresh("ok");
    } catch {
      setRefresh("failed");
    }
  }

  return (
    <Page back>
      <h1 className="text-3xl font-semibold tracking-tight">{t.settings.title}</h1>

      <Section title={t.settings.reminderTitle}>
        <ReminderFields settings={settings} onChange={(p) => store.setSettings(p)} />
        <p className="mt-3 text-sm text-muted-foreground">
          {soonest
            ? t.settings.example(whenFmt.format(reminderAt(soonest, settings)))
            : t.settings.noExample}
        </p>
      </Section>

      <Section title={t.settings.pushTitle}>
        <PushToggle />
      </Section>

      <Section title={t.settings.addressTitle}>
        <p className="text-base">{settings.address ?? t.settings.noAddress}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/address">{t.settings.changeAddress}</Link>
          </Button>
          {settings.address ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={refresh === "busy"}
              onClick={refreshSchedule}
            >
              {refresh === "busy" ? (
                <>
                  <Spinner /> {t.settings.refreshing}
                </>
              ) : (
                t.settings.refresh
              )}
            </Button>
          ) : null}
          {refresh === "ok" ? (
            <span role="status" className="text-sm font-medium text-primary">
              {t.settings.refreshed}
            </span>
          ) : null}
          {refresh === "failed" ? (
            <span role="status" className="text-sm text-destructive">
              {t.settings.refreshFailed}
            </span>
          ) : null}
        </div>
      </Section>

      <Section title={t.settings.dataTitle}>
        <p className="text-sm text-muted-foreground">{t.settings.dataHelp}</p>
      </Section>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
