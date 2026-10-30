import Link from "next/link";
import { ladeLeerstand, LEERSTAND_AUSGENOMMEN, LEERSTAND_STROM_KOSTENART } from "@/lib/leerstand";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { timeZone: "UTC" });
}

export default async function LeerstandPage() {
  const leerstand = await ladeLeerstand();
  const gesamt = leerstand.reduce((s, e) => s + e.summe, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Leerstand</h1>
        <p className="text-sm text-neutral-400">
          {leerstand.length} {leerstand.length === 1 ? "Einheit" : "Einheiten"} ohne laufenden Mietvertrag
          {leerstand.length > 0 && <> · Stromkosten seit Leerstandsbeginn {formatEuro(gesamt)}</>}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Ausgenommen: {LEERSTAND_AUSGENOMMEN.join(", ")} (Eigennutzung). Die Kundennummern stammen aus dem
          Verwendungszweck der Buchungen der Kostenart „{LEERSTAND_STROM_KOSTENART}“ dieser Einheit — fehlt eine
          Buchung oder ist sie einer anderen Einheit zugeordnet, fehlt sie hier.
        </p>
      </div>

      {leerstand.length === 0 ? (
        <p className="text-sm text-neutral-400">Aktuell steht keine Einheit leer.</p>
      ) : (
        <div className="space-y-4">
          {leerstand.map((e) => (
            <section key={e.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-medium text-white">
                  <Link prefetch={false} href={`/einheiten/${e.id}`} className="hover:underline">
                    {e.gebaeude} · {e.bezeichnung}
                  </Link>
                </h2>
                <span className="text-sm text-neutral-400">
                  {e.leerSeit ? `leer seit ${formatDatum(e.leerSeit)}` : "nie vermietet"}
                  {e.letzteMieter && <> · zuletzt {e.letzteMieter}</>}
                </span>
              </div>

              {e.geplantAb && (
                <p className="mt-2 text-sm text-amber-400">Neuer Mietvertrag geplant ab {formatDatum(e.geplantAb)}</p>
              )}

              <p className="mt-3 text-sm text-neutral-400">
                Stromkundennummer{e.kundennummern.length === 1 ? "" : "n"}:{" "}
                {e.kundennummern.length > 0 ? (
                  <span className="font-mono text-white">{e.kundennummern.join(", ")}</span>
                ) : (
                  <span className="text-neutral-500">keine Buchung gefunden</span>
                )}
              </p>

              {e.abbuchungen.length > 0 && (
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
                      {e.abbuchungen.map((a) => (
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
                        <td className="whitespace-nowrap py-1.5 text-right font-medium">{formatEuro(e.summe)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
