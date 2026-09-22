"use client";

import { useState } from "react";
import type { Uebersicht } from "@/lib/nk-uebersicht";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type UebersichtAuswahl = { value: string; label: string; gruppe: "objekt" | "haus" | "gebaeude" };

/**
 * Kostenaufschlüsselung gesamt mit Auswahl Objekt / Haus / Gebäude. Alle Ansichten kommen fertig
 * vom Server, der Wechsel passiert nur im Browser (kein Neuladen).
 */
export function Kostenuebersicht({
  jahr,
  auswahl,
  daten,
}: {
  jahr: number;
  auswahl: UebersichtAuswahl[];
  daten: Record<string, Uebersicht>;
}) {
  const [gewaehlt, setGewaehlt] = useState(auswahl[0].value);
  const u = daten[gewaehlt];
  const gesamtModus = u.modus === "gesamt";
  const gruppe = (g: UebersichtAuswahl["gruppe"]) => auswahl.filter((a) => a.gruppe === g);

  return (
    <div className="mb-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium text-white">Kostenaufschlüsselung</h2>
        <select
          value={gewaehlt}
          onChange={(e) => setGewaehlt(e.target.value)}
          aria-label="Ansicht wählen"
          className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        >
          {gruppe("objekt").map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
          {gruppe("haus").length > 0 && (
            <optgroup label="Haus">
              {gruppe("haus").map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          )}
          {gruppe("gebaeude").length > 0 && (
            <optgroup label="Gebäude">
              {gruppe("gebaeude").map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        {gesamtModus ? (
          <>
            Alle Kostenarten der Abrechnung {jahr} auf einen Blick — die Aufschlüsselungen aller Mieter
            zusammengefasst, je Kostenart über alle Kostenkreise summiert. &bdquo;Nicht umgelegt&ldquo; trägt der
            Eigentümer (z.B. Leerstand oder unterjähriger Mieterwechsel).
          </>
        ) : (
          <>
            Anteil dieses Hauses/Gebäudes an den Kostenarten der Abrechnung {jahr}. &bdquo;Kostenkreis gesamt&ldquo; ist der
            Jahresbetrag des ganzen Kostenkreises (z.B. Heizkosten Haus 2-12 für alle Häuser darin), &bdquo;Anteil&ldquo;
            der auf dieses Haus/Gebäude entfallende Teil, &bdquo;Auf Mieter umgelegt&ldquo; der davon tatsächlich
            abgerechnete Betrag. Einheiten, die im ganzen Jahr keinen Mietvertrag hatten, sind darin nicht enthalten.
          </>
        )}
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Kostenart</th>
              <th className="px-4 py-2">{gesamtModus ? "Kostenkreise" : "Anteil an Kostenkreis"}</th>
              <th className="px-4 py-2">Verteilung</th>
              {!gesamtModus && <th className="px-4 py-2 text-right">Kostenkreis gesamt</th>}
              <th className="px-4 py-2 text-right">{gesamtModus ? "Gesamt (Jahr)" : "Anteil (volles Jahr)"}</th>
              <th className="px-4 py-2 text-right">Auf Mieter umgelegt</th>
              <th className="px-4 py-2 text-right">Nicht umgelegt</th>
            </tr>
          </thead>
          <tbody>
            {u.zeilen.map((z) => {
              const rest = z.basis - z.umgelegt;
              return (
                <tr key={z.kostenartName} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">{z.kostenartName}</td>
                  <td className="px-4 py-2 text-neutral-400" title={z.kreiseTitel}>
                    {z.kreise}
                  </td>
                  <td className="px-4 py-2 text-neutral-400">{z.verteilung}</td>
                  {!gesamtModus && (
                    <td className="px-4 py-2 text-right text-neutral-500">
                      {z.kreisGesamt !== null ? formatEuro(z.kreisGesamt) : ""}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(z.basis)}</td>
                  <td className="px-4 py-2 text-right text-white">{formatEuro(z.umgelegt)}</td>
                  <td className={`px-4 py-2 text-right ${Math.abs(rest) < 0.005 ? "text-neutral-500" : "text-amber-400"}`}>
                    {formatEuro(rest)}
                  </td>
                </tr>
              );
            })}
            {u.zeilen.length === 0 && (
              <tr>
                <td colSpan={gesamtModus ? 6 : 7} className="px-4 py-6 text-center text-neutral-500">
                  Keine Kostenaufschlüsselung für diese Auswahl.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-700 bg-neutral-900 font-medium">
              <td className="px-4 py-2 text-white" colSpan={gesamtModus ? 3 : 4}>
                Summe
              </td>
              <td className="px-4 py-2 text-right text-white">{formatEuro(u.summe.basis)}</td>
              <td className="px-4 py-2 text-right text-white">{formatEuro(u.summe.umgelegt)}</td>
              <td className="px-4 py-2 text-right text-white">{formatEuro(u.summe.basis - u.summe.umgelegt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
