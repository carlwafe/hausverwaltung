import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KostenartForm } from "../kostenart-form";
import { BETRKV_NUMMER_LABEL } from "@/lib/betrkv-nummer";
import { updateKostenart, deleteKostenart } from "../actions";
import { DeleteButton } from "@/components/delete-button";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export default async function KostenartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [kostenart, jahreswerte, buchungenGesamt] = await Promise.all([
    prisma.kostenart.findUnique({
      where: { id },
      include: { dienstleister: { select: { id: true, name: true, aktiv: true }, orderBy: { name: "asc" } } },
    }),
    // Summe und Anzahl der aktiven Kostenpositionen je Kostenjahr (eine Abfrage).
    prisma.buchung.groupBy({
      by: ["jahr"],
      where: { kostenartId: id, buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
      _sum: { betrag: true },
      _count: { _all: true },
    }),
    // Jede Buchung (auch stornierte) verhindert das Löschen (Fremdschlüssel mit Restrict).
    prisma.buchung.count({ where: { kostenartId: id } }),
  ]);
  if (!kostenart) notFound();

  const aktuellesJahr = new Date().getFullYear();
  const summeJahr = (jahr: number) => Number(jahreswerte.find((w) => w.jahr === jahr)?._sum.betrag ?? 0);
  const anzahl = jahreswerte.reduce((s, w) => s + w._count._all, 0);

  return (
    <div>
      <div className="mb-6">
        <Link href="/kostenarten" className="text-sm text-neutral-400 hover:text-white hover:underline">
          ← Alle Kostenarten
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{kostenart.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              kostenart.umlagefaehig ? "bg-green-500/10 text-green-400" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {kostenart.umlagefaehig ? "umlagefähig" : "nicht umlagefähig"}
          </span>
          {kostenart.umlagefaehig && kostenart.betrKvNummer && (
            <span>BetrKV Nr. {BETRKV_NUMMER_LABEL[kostenart.betrKvNummer] ?? kostenart.betrKvNummer}</span>
          )}
          {kostenart.umlagefaehig && kostenart.istSonstigeBetriebskosten && <span>BetrKV Nr. 17 — sonstige Betriebskosten</span>}
          {!kostenart.belegErforderlich && (
            <>
              <span aria-hidden="true">·</span>
              <span>kein Einzelbeleg nötig</span>
            </>
          )}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[aktuellesJahr, aktuellesJahr - 1, aktuellesJahr - 2].map((j) => (
          <Kennzahl key={j} titel={`Kosten ${j}`} wert={formatEuro(summeJahr(j))}>
            {anzahlText(jahreswerte.find((w) => w.jahr === j)?._count._all ?? 0)}
          </Kennzahl>
        ))}
        <Kennzahl titel="Dienstleister" wert={String(kostenart.dienstleister.length)}>
          {kostenart.dienstleister.length === 0 ? (
            "keinem Dienstleister zugeordnet"
          ) : (
            <span className="flex flex-wrap gap-x-2">
              {kostenart.dienstleister.map((d) => (
                <Link
                  key={d.id}
                  href={`/dienstleister/${d.id}`}
                  className={`hover:text-white hover:underline ${d.aktiv ? "" : "line-through"}`}
                >
                  {d.name}
                </Link>
              ))}
            </span>
          )}
        </Kennzahl>
      </div>

      <KostenartForm initial={kostenart} action={updateKostenart.bind(null, id)} abbrechenHref="/kostenarten" />

      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/60 p-4">
        <div>
          <h2 className="text-sm font-medium text-white">Kostenart löschen</h2>
          <p className="text-xs text-neutral-400">
            {buchungenGesamt > 0
              ? `Nicht möglich: ${buchungenGesamt} ${buchungenGesamt === 1 ? "Buchung verweist" : "Buchungen verweisen"} darauf (auch stornierte zählen). Insgesamt ${anzahl} aktive Kostenpositionen.`
              : "Gedacht für versehentlich angelegte Kostenarten ohne Buchungen."}
          </p>
        </div>
        {buchungenGesamt === 0 && (
          <DeleteButton
            action={deleteKostenart.bind(null, id)}
            confirmText={`Kostenart „${kostenart.name}“ wirklich löschen?`}
            label="Kostenart löschen"
          />
        )}
      </section>
    </div>
  );
}

const anzahlText = (n: number) => `${n} ${n === 1 ? "Position" : "Positionen"}`;

function Kennzahl({ titel, wert, children }: { titel: string; wert: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-white sm:text-lg">{wert}</p>
      {children ? <div className="mt-0.5 text-xs text-neutral-500">{children}</div> : null}
    </div>
  );
}
