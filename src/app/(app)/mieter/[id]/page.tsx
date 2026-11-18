import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MieterForm } from "../mieter-form";
import { updateMieter, deleteMieter } from "../actions";
import { DeleteButton } from "@/components/delete-button";
import { mieterName } from "@/lib/mieter-name";
import { istAmtZahler } from "@/lib/amt-zahlt";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

// tel:-Link aus einer Telefonangabe, die auch Zusätze enthalten kann („0170 … (abends)“).
function telefonHref(nummer: string) {
  const ziffern = nummer.split(/[a-zA-Z(,;/]/)[0].replace(/[^\d+]/g, "");
  return `tel:${ziffern}`;
}

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const STATUS_FARBE: Record<string, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  GEPLANT: "bg-amber-500/10 text-amber-400",
  BEENDET: "bg-neutral-800 text-neutral-300",
};

export default async function MieterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [mieter, mietvertraege] = await Promise.all([
    prisma.mieter.findUnique({ where: { id } }),
    prisma.mietvertrag.findMany({
      where: { mieter: { some: { id } } },
      include: { einheit: true },
      orderBy: { beginn: { sort: "desc", nulls: "last" } },
    }),
  ]);
  if (!mieter) notFound();

  // Laufende/geplante Verträge für die Zeile unter dem Namen (z.B. „HS 4 WHG 2 · Aktiv“).
  const aktuelle = mietvertraege.filter((v) => v.status !== "BEENDET");
  const kontakte = [
    mieter.email && { label: mieter.email, href: `mailto:${mieter.email}`, art: "E-Mail" },
    mieter.handynummer && { label: mieter.handynummer, href: telefonHref(mieter.handynummer), art: "Handy" },
    mieter.festnetznummer && { label: mieter.festnetznummer, href: telefonHref(mieter.festnetznummer), art: "Festnetz" },
  ].filter((k): k is { label: string; href: string; art: string } => Boolean(k));

  return (
    <div>
      <div className="mb-6">
        <Link href="/mieter" className="text-sm text-neutral-400 hover:text-white hover:underline">
          ← Alle Mieter
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{mieterName(mieter)}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-400">
          {aktuelle.length === 0 && <span>Kein laufender Mietvertrag</span>}
          {aktuelle.map((v) => (
            <Link key={v.id} href={`/mietvertraege/${v.id}`} className="inline-flex items-center gap-2 hover:text-white hover:underline">
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
              {v.einheit.bezeichnung}
            </Link>
          ))}
        </p>
        {kontakte.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {kontakte.map((k) => (
              <a
                key={k.art}
                href={k.href}
                title={`${k.art}: ${k.label}`}
                className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-white hover:bg-neutral-900"
              >
                <span className="text-xs text-neutral-400">{k.art}</span>
                <span className="truncate">{k.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <MieterForm
        initial={mieter}
        action={updateMieter.bind(null, id)}
        amtZahlt={istAmtZahler(mietvertraege)}
        abbrechenHref="/mieter"
      />

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-white">
          Mietverträge ({mietvertraege.length})
        </h2>
        <div className="rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Einheit</th>
                <th className="hidden px-4 py-2 md:table-cell">Zeitraum</th>
                <th className="hidden px-4 py-2 md:table-cell">Miete gesamt</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {mietvertraege.map((v) => (
                <tr key={v.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">
                    <Link href={`/einheiten/${v.einheitId}`} className="hover:underline">
                      {v.einheit.bezeichnung}
                    </Link>
                    {/* Handy: Zeitraum und Miete stehen unter der Einheit. */}
                    <span className="mt-0.5 block text-xs text-neutral-400 md:hidden">
                      {v.beginn ? formatDate(v.beginn) : "unbekannt"} – {v.ende ? formatDate(v.ende) : "laufend"} ·{" "}
                      {formatEuro(
                        Number(v.kaltmiete) +
                          Number(v.nebenkostenVorauszahlung) +
                          (v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0),
                      )}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2 text-white md:table-cell">
                    {v.beginn ? formatDate(v.beginn) : "unbekannt"} –{" "}
                    {v.ende ? formatDate(v.ende) : "laufend"}
                  </td>
                  <td className="hidden px-4 py-2 text-white md:table-cell">
                    {formatEuro(
                      Number(v.kaltmiete) +
                        Number(v.nebenkostenVorauszahlung) +
                        (v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0),
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/mietvertraege/${v.id}`}
                      className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-neutral-700 px-3 text-xs text-white hover:bg-neutral-900"
                    >
                      Mietvertrag öffnen
                    </Link>
                  </td>
                </tr>
              ))}
              {mietvertraege.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    Noch keine Mietverträge für diesen Mieter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/60 p-4">
        <div>
          <h2 className="text-sm font-medium text-white">Mieter löschen</h2>
          <p className="text-xs text-neutral-400">
            {mietvertraege.length > 0
              ? `Der Mieter wird dabei aus ${mietvertraege.length === 1 ? "seinem Mietvertrag" : `seinen ${mietvertraege.length} Mietverträgen`} entfernt.`
              : "Der Mieter hängt an keinem Mietvertrag."}
          </p>
        </div>
        <DeleteButton
          action={deleteMieter.bind(null, id)}
          confirmText={
            mietvertraege.length > 0
              ? `${mieterName(mieter)} wirklich löschen? Der Mieter wird aus seinen Mietverträgen entfernt.`
              : `${mieterName(mieter)} wirklich löschen?`
          }
          label="Mieter löschen"
        />
      </section>
    </div>
  );
}
