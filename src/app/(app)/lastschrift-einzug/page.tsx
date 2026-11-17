import { ladeEinzugslauf } from "@/lib/lastschrift-einzug";
import { naechsterEinzugsmonat } from "@/lib/target-tage";

const euro = (cent: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cent / 100);
const terminText = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const monatLang = (jahr: number, monat: number) =>
  new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(jahr, monat - 1, 1)));

const feld = "h-10 w-44 rounded-md border border-neutral-700 bg-transparent px-2 text-sm text-white outline-none focus:border-neutral-400";

type Suche = { monat?: string; datum?: string; ohne?: string | string[] };

// Erzeugt die Einzugsdatei der Mieten (SEPA-Lastschrift, pain.008) für einen Mietmonat. Rechnet wie die anderen schweren
// Seiten erst nach „Berechnen“ (Vercel-CPU, docs/deployment-vercel.md); schreibt nichts ins Journal.
export default async function LastschriftEinzugPage({ searchParams }: { searchParams: Promise<Suche> }) {
  const sp = await searchParams;
  const standard = naechsterEinzugsmonat();
  const standardMonat = `${standard.jahr}-${String(standard.monat).padStart(2, "0")}`;
  const gewaehlt = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const angefordert = !!gewaehlt && Number(gewaehlt[2]) >= 1 && Number(gewaehlt[2]) <= 12;
  const ohne = (Array.isArray(sp.ohne) ? sp.ohne : sp.ohne ? [sp.ohne] : []).filter(Boolean);

  const lauf = angefordert
    ? await ladeEinzugslauf({ jahr: Number(gewaehlt![1]), monat: Number(gewaehlt![2]), faelligAm: sp.datum || null, ohne })
    : null;

  const downloadHref = lauf
    ? `/api/lastschrift-einzug?${new URLSearchParams([
        ["monat", `${lauf.jahr}-${String(lauf.monat).padStart(2, "0")}`],
        ["datum", lauf.faelligAm],
        ...ohne.map((id) => ["ohne", id] as [string, string]),
      ]).toString()}`
    : null;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Lastschrift-Einzug</h1>
      <p className="mb-6 max-w-3xl text-sm text-neutral-400">
        Erzeugt die Einzugsdatei der Mieten (SEPA-Lastschrift, <span className="whitespace-nowrap">pain.008</span>) für einen Mietmonat. Du lädst sie
        selbst im Online-Banking hoch; die App schickt nichts an die Bank und speichert nichts. Eingezogen wird, wer Zahlungsweg „Lastschrift“ und ein
        vollständiges Mandat hat. Die Beträge kommen aus dem Mietvertrag (inkl. Mieterhöhungen und Mietnachlässen).
      </p>

      <form method="get" className="mb-6 rounded-lg border border-neutral-800 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="monat" className="mb-1 block text-xs text-neutral-400">
              Mietmonat
            </label>
            <input id="monat" type="month" name="monat" defaultValue={gewaehlt ? `${gewaehlt[1]}-${gewaehlt[2]}` : standardMonat} className={feld} />
          </div>
          <div>
            <label htmlFor="datum" className="mb-1 block text-xs text-neutral-400" title="Leer = 3. Bankarbeitstag des Monats (vertraglicher Fälligkeitstermin).">
              Einzugstermin (optional)
            </label>
            <input id="datum" type="date" name="datum" defaultValue={sp.datum ?? ""} className={feld} />
          </div>
          <button type="submit" className="h-10 w-44 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-neutral-200">
            {lauf ? "Neu berechnen" : "Berechnen"}
          </button>
        </div>

        {lauf && (
          <div className="mt-5 space-y-4">
            <div className="text-sm text-neutral-300">
              <span className="font-medium text-white">{monatLang(lauf.jahr, lauf.monat)}</span> · Einzugstermin{" "}
              <span className="font-medium text-white">{terminText(lauf.faelligAm)}</span>
            </div>

            {lauf.terminHinweis && (
              <p className="rounded-md border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-300">{lauf.terminHinweis}</p>
            )}
            {lauf.glaeubigerProbleme.length > 0 && (
              <p className="rounded-md border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                Gläubigerangaben unvollständig: {lauf.glaeubigerProbleme.join("; ")}. Zu pflegen unter Einstellungen → Objekt.
              </p>
            )}
            {lauf.dateiFehler && lauf.glaeubigerProbleme.length === 0 && (
              <p className="whitespace-pre-line rounded-md border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{lauf.dateiFehler}</p>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm text-neutral-300">
                <span className="text-xl font-semibold text-white">{lauf.anzahl}</span> Einzüge ·{" "}
                <span className="text-xl font-semibold text-white">{euro(lauf.summeCent)}</span>
              </div>
              {lauf.xml && downloadHref && (
                <a
                  href={downloadHref}
                  download={lauf.dateiname}
                  className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-neutral-200"
                >
                  Datei herunterladen
                </a>
              )}
            </div>
            {lauf.xml && (
              <p className="text-xs text-neutral-500">
                Der Download enthält genau die Einzüge unten ohne Haken bei „Diesmal nicht“. Nach Änderungen an den Haken zuerst „Neu berechnen“ klicken.
                Jeder Download bekommt eine neue Nachrichten-ID; eine schon eingereichte Datei nicht noch einmal hochladen (Doppeleinzug).
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-3 py-2.5">Einheit</th>
                    <th className="px-3 py-2.5">Mieter</th>
                    <th className="px-3 py-2.5 text-right">Betrag</th>
                    <th className="px-3 py-2.5 text-right" title="Letzter Monatseinzug laut Kontoauszug">Letzter Einzug</th>
                    <th className="w-full px-3 py-2.5">Hinweis</th>
                    <th className="px-3 py-2.5 text-center" title="Haken = diesmal nicht einziehen">Diesmal nicht</th>
                  </tr>
                </thead>
                <tbody>
                  {lauf.zeilen.map((z) => {
                    const hinweise: { text: string; farbe: string }[] = [];
                    if (z.letzterEinzugCent === null) hinweise.push({ text: "noch kein Monatseinzug im Journal", farbe: "text-amber-300" });
                    else if (z.letzterEinzugCent !== z.betragCent)
                      hinweise.push({ text: `Betrag geändert (Mieterhöhung angekündigt?)`, farbe: "text-amber-300" });
                    if (z.ruecklastschriften > 0)
                      hinweise.push({ text: `${z.ruecklastschriften} Rücklastschrift${z.ruecklastschriften > 1 ? "en" : ""} in 6 Monaten`, farbe: "text-red-400" });
                    if (z.folge === "FRST") hinweise.push({ text: "erster Einzug (FRST)", farbe: "text-amber-300" });
                    return (
                      <tr key={z.vertragId} className={`border-t border-neutral-800 ${z.ausgenommen ? "opacity-50" : ""}`}>
                        <td className="whitespace-nowrap px-3 py-2 text-white">{z.einheit}</td>
                        <td className="px-3 py-2 text-neutral-200">{z.mieter}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-200">{euro(z.betragCent)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-400">
                          {z.letzterEinzugCent === null ? "–" : euro(z.letzterEinzugCent)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {hinweise.map((h) => (
                            <div key={h.text} className={h.farbe}>
                              {h.text}
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            name="ohne"
                            value={z.vertragId}
                            defaultChecked={z.ausgenommen}
                            aria-label={`${z.einheit} diesmal nicht einziehen`}
                            className="h-4 w-4 accent-white"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {lauf.zeilen.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                        Keine Lastschrift-Verträge für diesen Monat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {lauf.ausgelassen.length > 0 && (
              <details open className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
                <summary className="cursor-pointer font-medium text-white">Nicht in der Datei ({lauf.ausgelassen.length})</summary>
                <ul className="mt-3 space-y-1">
                  {lauf.ausgelassen.map((a) => (
                    <li key={a.vertragId}>
                      <span className="text-white">{a.einheit}</span> <span className="text-neutral-400">({a.mieter})</span>: {a.grund}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </form>

      <details className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
        <summary className="cursor-pointer font-medium text-white">So geht es weiter</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-neutral-400">
          <li>Hinweise prüfen: geänderte Beträge müssen den Mietern angekündigt sein, bei Rücklastschriften ggf. „Diesmal nicht“ setzen.</li>
          <li>Datei herunterladen und im Online-Banking als Sammellastschrift (Basis-Lastschrift, Folgelastschrift) hochladen; Einzugstermin und Summe dort gegenprüfen.</li>
          <li>Wer künftig gar nicht mehr eingezogen werden soll: am Mietvertrag den Zahlungsweg auf „Überweisung“ stellen.</li>
          <li>Die Gutschriften erscheinen nach dem nächsten Kontoauszug-Import als Mietzahlungen; der Einzug selbst erzeugt keine Buchung.</li>
        </ol>
      </details>
    </div>
  );
}
