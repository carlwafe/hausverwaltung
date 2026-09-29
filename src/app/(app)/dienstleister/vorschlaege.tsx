"use client";

import { useState, useTransition } from "react";
import { uebernehmeVorschlaege } from "./actions";

export type VorschlagRow = {
  name: string;
  kostenartId: string;
  kostenartName: string;
  gebaeudeAuswahl: string | null;
  gebaeudeLabel: string;
  anzahl: number;
  summe: number;
  sicherheit: number;
};

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function Vorschlaege({ rows }: { rows: VorschlagRow[] }) {
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function uebernehmen(liste: VorschlagRow[]) {
    setFehler(null);
    start(async () => {
      try {
        await uebernehmeVorschlaege(
          liste.map((r) => ({ name: r.name, kostenartId: r.kostenartId, gebaeudeAuswahl: r.gebaeudeAuswahl })),
        );
      } catch (e) {
        setFehler(e instanceof Error ? e.message : "Unbekannter Fehler");
      }
    });
  }

  if (rows.length === 0) return null;
  const sichere = rows.filter((r) => r.sicherheit === 1);

  return (
    <section className="mb-8 rounded-md border border-neutral-800 p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Vorschläge aus dem Import-Verlauf</h2>
          <p className="text-sm text-neutral-400">
            Empfänger, die mindestens zweimal als Kosten gebucht wurden und noch keinem Dienstleister
            zugeordnet sind. Kostenart = häufigste bisherige Zuordnung.
          </p>
        </div>
        {sichere.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => uebernehmen(sichere)}
            className="shrink-0 rounded-md border border-neutral-700 px-3 py-2 text-sm text-white hover:bg-neutral-900 disabled:opacity-50"
          >
            Alle eindeutigen übernehmen ({sichere.length})
          </button>
        )}
      </div>
      {fehler && <p className="mb-2 text-sm text-red-400">{fehler}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1 pr-4 font-normal">Empfänger</th>
              <th className="py-1 pr-4 font-normal">Kostenart</th>
              <th className="py-1 pr-4 font-normal">Gebäude</th>
              <th className="py-1 pr-4 text-right font-normal">Buchungen</th>
              <th className="py-1 pr-4 text-right font-normal">Summe</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-neutral-800">
                <td className="py-1.5 pr-4">{r.name}</td>
                <td className="py-1.5 pr-4">
                  {r.kostenartName}
                  {r.sicherheit < 1 && (
                    <span
                      className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
                      title="Dieser Empfänger wurde bisher unterschiedlichen Kostenarten zugeordnet"
                    >
                      uneinheitlich {Math.round(r.sicherheit * 100)} %
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-4">{r.gebaeudeLabel}</td>
                <td className="py-1.5 pr-4 text-right">{r.anzahl}</td>
                <td className="py-1.5 pr-4 text-right">{euro.format(r.summe)}</td>
                <td className="py-1.5 text-right">
                  {r.sicherheit === 1 ? (
                  <button
                      type="button"
                      disabled={pending}
                      onClick={() => uebernehmen([r])}
                      className="rounded-md bg-white px-2 py-1 text-xs font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
                    >
                      Übernehmen
                    </button>
                  ) : (
                    <span
                      className="text-xs text-neutral-500"
                      title="Mehrere Kostenarten je nach Vertrag/Zählpunkt — die Zuordnung aus dem Verlauf ist genauer als ein fester Dienstleister"
                    >
                      Verlauf regelt
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
