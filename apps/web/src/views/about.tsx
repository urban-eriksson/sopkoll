import { Page } from "@/components/page";
import { t } from "@/lib/i18n";

const a = t.about;

/** "Om appen": what sopkoll does and exactly what it stores, in plain Swedish. */
export function About() {
  return (
    <Page back>
      <h1 className="text-3xl font-semibold tracking-tight">{a.title}</h1>
      <p className="mt-3 text-base text-muted-foreground">{a.lead}</p>

      <Section title={a.howTitle}>
        <List items={a.how} />
        <p>{a.howOwnBins}</p>
      </Section>

      <Section title={a.dataTitle}>
        <p>{a.dataIntro}</p>
        <p>{a.dataLocal}</p>
        <p>{a.dataPushIntro}</p>
        <List items={a.dataPush} />
        <p>{a.dataSecurity}</p>
      </Section>

      <Section title={a.wipeTitle}>
        <p>{a.wipe}</p>
      </Section>

      <Section title={a.techTitle}>
        <p>
          {a.tech}{" "}
          <a
            href={a.codeUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            {a.codeLabel}
          </a>
        </p>
      </Section>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed">{children}</div>
    </section>
  );
}

function List({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-primary">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
