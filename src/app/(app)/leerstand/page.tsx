import Link from "next/link";
import {
  ladeLeerstand,
  LEERSTAND_AB,
  LEERSTAND_AUSGENOMMEN,
  LEERSTAND_STROM_KOSTENART,
  type LeerstandAbbuchung,
  type LeerstandPeriode,
} from "@/lib/leerstand";

type Ansicht = "alle" | "aktuell" | "frueher";

const ANSICHTEN: { wert: Ansicht; label: string }[] = [
  { wert: "alle", label: "Alle" },
  { wert: "aktuell", label: "Jetzt leer" },
  { wert: "frueher", label: "Frühere Leerstände" },
];

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { timeZone: "UTC" });
}

function zeitraum(p: LeerstandPeriode) {
  const von = p.von ? formatDatum(p.von) : "Beginn der Aufzeichnung";
  if (p.bis) return `${von} – ${formatDatum(p.bis)}`;
  return p.status === "kuenftig" ? `ab ${von} (künftig)` : `seit ${von} (aktuell leer)`;
}

function Abbuchungen({ liste, summe }: { liste: LeerstandAbbuchung[]; summe: number }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
            <th className="py-1.5 pr-4 font-normal">Datum</th>
            <th className="py-1.5 pr-4 font-normal">Kundennr.</th>
            <th className="py-1.5 pr-4 font-normal">Verwendungszweck</th>
            <th className="py-1.5 text-right font-normal">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((a) => (
            <tr key={a.id} className="border-b border-neutral-900 text-neutral-300">
              <td className="whitespace-nowrap py-1.5 pr-4">
                <Link prefetch={false} href={`/kosten/${a.id}`} className="hover:underline">
                  {formatDatum(a.datum)}
                </Link>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-4 font-mono">{a.kundennummer ?? "–"}</td>
              <td className="py-1.5 pr-4 text-neutral-400">
                {a.verwendungszweck}
                {a.nurGebaeude && (
                  <span className="ml-2 rounded border border-neutral-700 px-1 text-xs text-amber-400">
                    nur dem Gebäude zugeordnet
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap py-1.5 text-right">{formatEuro(a.betrag)}</td>
            </tr>
          ))}
          <tr className="text-white">
            <td colSpan={3} className="py-1.5 pr-4 text-right text-xs text-neutral-500">
              Summe
            </td>
            <td className="whitespace-nowrap py-1.5 text-right font-medium">{formatEuro(summe)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function LeerstandPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const { ansicht: param } = await searchParams;
  const ansicht: Ansicht = param === "aktuell" || param === "frueher" ? param : "alle";
  const { perioden, nichtZugeordnet } = await ladeLeerstand();

  const sichtbar = perioden.filter((p) =>
    ansicht === "alle" ? true : ansicht === "aktuell" ? p.status === "aktuell" : p.status === "frueher",
  );
  const jetztLeer = perioden.filter((p) => p.status === "aktuell").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Leerstand</h1>
        <p className="text-sm text-neutral-400">
          {jetztLeer} {jetztLeer === 1 ? "Einheit steht" : "Einheiten stehen"} jetzt leer · {perioden.length}{" "}
          Leerstandszeiträume seit {formatDatum(LEERSTAND_AB.toISOString())}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Ausgenommen: {LEERSTAND_AUSGENOMMEN.join(", ")} (Eigennutzung). Ein Leerstand ist die Zeit ohne Mietvertrag
          zwischen zwei Verträgen oder nach dem letzten. Die Kundennummern stammen aus dem Verwendungszweck der
          Buchungen der Kostenart „{LEERSTAND_STROM_KOSTENART}“.
        </p>
      </div>

      {nichtZugeordnet.length > 0 && (
        <section className="mb-6 rounded-lg border border-amber-700/60 bg-neutral-950 p-4">
          <h2 className="text-base font-medium text-amber-400">
            Nicht zuordenbare Leerstandskosten ({nichtZugeordnet.length})
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Strombuchungen, die sich keinem Leerstandszeitraum zuordnen ließen, und noch nicht kategorisierte
            Kontoauszug-Importe mit Strom-/Stadtwerke-Bezug.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
                  <th className="py-1.5 pr-4 font-normal">Datum</th>
                  <th className="py-1.5 pr-4 font-normal">Kundennr.</th>
                  <th className="py-1.5 pr-4 font-normal">Verwendungszweck / Zuordnung</th>
                  <th className="py-1.5 text-right font-normal">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {nichtZugeordnet.map((n) => (
                  <tr key={n.id} className="border-b border-neutral-900 align-top text-neutral-300">
                    <td className="whitespace-nowrap py-1.5 pr-4">
                      <Link
                        prefetch={false}
                        href={n.nichtKategorisiert ? "/kosten" : `/kosten/${n.id}`}
                        className="hover:underline"
                      >
                        {formatDatum(n.datum)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-4 font-mono">{n.kundennummer ?? "–"}</td>
                    <td className="py-1.5 pr-4">
                      <span className="text-neutral-400">{n.verwendungszweck}</span>
                      <span className="mt-0.5 block text-xs text-amber-400">
                        {n.grund}
                        {n.ort && <> · {n.ort}</>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 text-right">{formatEuro(n.betrag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mb-4 flex gap-2">
        {ANSICHTEN.map((a) => (
          <Link
            key={a.wert}
            prefetch={false}
            href={a.wert === "alle" ? "/leerstand" : `/leerstand?ansicht=${a.wert}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              ansicht === a.wert
                ? "border-white bg-white font-medium text-black"
                : "border-neutral-700 text-white hover:bg-neutral-900"
            }`}
          >
            {a.label}
          </Link>
        ))}
      </div>

      {sichtbar.length === 0 ? (
        <p className="text-sm text-neutral-400">Keine Leerstände in dieser Ansicht.</p>
      ) : (
        <div className="space-y-4">
          {sichtbar.map((p) => (
            <section key={p.key} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-medium text-white">
                  <Link prefetch={false} href={`/einheiten/${p.einheitId}`} className="hover:underline">
                    {p.gebaeude} · {p.bezeichnung}
                  </Link>
                </h2>
                <span className={`text-sm ${p.status === "aktuell" ? "text-amber-400" : "text-neutral-400"}`}>
                  {zeitraum(p)}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-400">
                {p.vormieter ? `Vormieter: ${p.vormieter}` : "Kein Vormieter erfasst"}
                {p.nachmieterAb && <> · neuer Mietvertrag ab {formatDatum(p.nachmieterAb)}</>}
              </p>

              <p className="mt-3 text-sm text-neutral-400">
                Stromkundennummer{p.kundennummern.length === 1 ? "" : "n"}:{" "}
                {p.kundennummern.length > 0 ? (
                  <span className="font-mono text-white">{p.kundennummern.join(", ")}</span>
                ) : (
                  <span className="text-neutral-500">keine Buchung gefunden</span>
                )}
              </p>

              {p.abbuchungen.length > 0 && <Abbuchungen liste={p.abbuchungen} summe={p.summe} />}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
