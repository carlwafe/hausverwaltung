"use client";

import { useState, useTransition } from "react";
import { uebernehmeVorschlaege } from "./actions";

export type VorschlagRow = {
  name: string;
  kostenarten: { id: string; name: string }[];
  gebaeudeAuswahl: string | null;
  gebaeudeLabel: string;
  anzahl: number;
  summe: number;
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
          liste.map((r) => ({ name: r.name, kostenartIds: r.kostenarten.map((k) => k.id), gebaeudeAuswahl: r.gebaeudeAuswahl })),
        );
      } catch (e) {
        setFehler(e instanceof Error ? e.message : "Unbekannter Fehler");
      }
    });
  }

  if (rows.length === 0) return null;
  const sichere = rows.filter((r) => r.kostenarten.length === 1);

  return (
    <section className="mb-8 rounded-md border border-neutral-800 p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Vorschläge aus dem Import-Verlauf</h2>
          <p className="text-sm text-neutral-400">
            Empfänger, die mindestens zweimal als Kosten gebucht wurden und noch keinem Dienstleister
            zugeordnet sind. Kostenarten = die bisher verwendeten (mind. 10 % der Buchungen).
          </p>
        </div>
        {sichere.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => uebernehmen(sichere)}
            className="shrink-0 rounded-md border border-neutral-700 px-3 py-2 text-sm text-white hover:bg-neutral-900 disabled:opacity-50"
          >
            Alle mit einer Kostenart übernehmen ({sichere.length})
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
                <td className="py-1.5 pr-4">{r.kostenarten.map((k) => k.name).join(", ")}</td>
                <td className="py-1.5 pr-4">{r.gebaeudeLabel}</td>
                <td className="py-1.5 pr-4 text-right">{r.anzahl}</td>
                <td className="py-1.5 pr-4 text-right">{euro.format(r.summe)}</td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => uebernehmen([r])}
                    className="rounded-md bg-white px-2 py-1 text-xs font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
                  >
                    Übernehmen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
