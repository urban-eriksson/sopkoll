import { MapPin, Plus } from "lucide-react";
import { Link, Navigate } from "react-router";
import { BinIcon } from "@/components/bin-icon";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { capitalize, formatLong, formatShort, frequencyLabel, relative } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Item } from "@/lib/model";
import { reminderAt, upcomingDates } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/use-today";

const timeFmt = new Intl.DateTimeFormat("sv-SE", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function Dashboard() {
  const { items, settings, onboarded } = useStore();
  const today = useToday();

  if (!onboarded && items.length === 0) return <Navigate to="/welcome" replace />;

  const rows = items
    .map((item) => ({ item, dates: upcomingDates(item, today, 3) }))
    .sort((a, b) => (a.dates[0] ?? "9").localeCompare(b.dates[0] ?? "9"));
  const active = rows.filter((r) => r.item.enabled && r.dates[0]);
  const soonest = active[0]?.dates[0];
  const nextUp = active.filter((r) => r.dates[0] === soonest);

  return (
    <Page>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t.dashboard.heading}</h1>
        <Button asChild size="sm" variant="outline">
          <Link to="/items/new">
            <Plus data-icon="inline-start" /> {t.nav.addItem}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col gap-4">
            <p className="text-base text-muted-foreground">{t.dashboard.empty}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/welcome">
                  <MapPin data-icon="inline-start" /> {t.dashboard.fromAddress}
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/items/new">{t.dashboard.addManual}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {soonest ? (
        <section className="mt-6 rounded-2xl bg-primary p-5 text-primary-foreground shadow-[0_3px_0_0_var(--primary-edge)]">
          <p className="text-sm font-medium opacity-80">{t.dashboard.nextUp}</p>
          <p className="mt-1 font-heading text-2xl font-semibold">
            {capitalize(formatLong(soonest))}
          </p>
          <p className="text-sm opacity-80">{relative(soonest, today)}</p>
          <ul className="mt-4 flex flex-col gap-2">
            {nextUp.map(({ item }) => (
              <li key={item.id} className="flex items-center gap-3">
                <BinIcon type={item.type} className="size-9 text-primary-foreground" />
                <span className="text-base font-medium">{item.name}</span>
              </li>
            ))}
          </ul>
          {reminderAt(soonest, settings) > today ? (
            <p className="mt-4 text-xs opacity-70">
              {t.dashboard.reminder(timeFmt.format(reminderAt(soonest, settings)))}
            </p>
          ) : null}
        </section>
      ) : items.length > 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t.dashboard.nothingSoon}</p>
      ) : null}

      <ul className="mt-6 flex flex-col gap-3">
        {rows.map(({ item, dates }) => (
          <li key={item.id}>
            <ItemCard item={item} dates={dates} today={today} />
          </li>
        ))}
      </ul>

      {settings.address ? (
        <p className="mt-8 text-xs text-muted-foreground">
          {t.dashboard.refreshedFrom(settings.address)}
        </p>
      ) : null}
    </Page>
  );
}

function ItemCard({ item, dates, today }: { item: Item; dates: string[]; today: Date }) {
  return (
    <Link
      to={`/items/${item.id}`}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className={item.enabled ? undefined : "opacity-60"}>
        <CardContent className="flex items-start gap-4">
          <BinIcon type={item.type} className="mt-0.5 size-12 text-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="truncate font-heading text-lg font-semibold">{item.name}</h2>
              {!item.enabled ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {t.dashboard.paused}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {frequencyLabel(item.intervalDays, item.seasonMonths)}
            </p>
            {dates[0] ? (
              <p className="mt-2 text-base">
                <span className="font-medium">{capitalize(formatShort(dates[0]))}</span>
                <span className="text-muted-foreground"> · {relative(dates[0], today)}</span>
              </p>
            ) : null}
            {dates.length > 1 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dates.slice(1).map(formatShort).join(" · ")}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
