"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DoppelzahlungPaar } from "@/lib/kosten-doppelzahlung";
import { pruefeKostenDoppelzahlungen } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(iso: string | null) {
  return iso ? iso.split("-").reverse().join(".") : "–";
}

/**
 * Knopf "Doppelzahlungen prüfen" auf der Kosten-Seite: durchsucht auf Klick die gebuchten Kosten nach
 * derselben Rechnung (Nummer, Betrag, Empfänger) zweimal bezahlt und zeigt die Paare mit Links zu
 * beiden Buchungen. Läuft bewusst nur auf Knopfdruck (Vercel-CPU), siehe doppelzahlung.ts.
 */
export function DoppelzahlungPruefen() {
  const [paare, setPaare] = useState<DoppelzahlungPaar[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pruefen = () =>
    start(async () => {
      setFehler(null);
      try {
        setPaare(await pruefeKostenDoppelzahlungen());
      } catch {
        setFehler("Die Prüfung ist fehlgeschlagen. Bitte erneut versuchen.");
      }
    });

  const offen = paare?.filter((p) => !p.rueckzahlung).length ?? 0;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={pruefen}
          disabled={pending}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Prüfe…" : "Doppelzahlungen prüfen"}
        </button>
        <p className="max-w-2xl text-xs text-neutral-500">
          Sucht Rechnungen, die zweimal bezahlt wurden: gleiche Rechnungsnummer, gleicher Betrag, gleicher
          Empfänger, höchstens 120 Tage auseinander. Abschläge und Raten zählen nicht.
        </p>
      </div>
      {fehler && <p className="mt-2 text-sm text-red-400">{fehler}</p>}
      {paare && (
        <div className="mt-3">
          {paare.length === 0 ? (
            <p className="text-sm text-neutral-400">Keine möglichen Doppelzahlungen gefunden.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-neutral-300">
                {paare.length} mögliche Doppelzahlung{paare.length === 1 ? "" : "en"}, davon {offen} ohne gebuchte
                Rückzahlung.
              </p>
              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Empfänger / Rechnung</th>
                      <th className="px-3 py-2 text-right">Betrag</th>
                      <th className="px-3 py-2">1. Zahlung</th>
                      <th className="px-3 py-2">2. Zahlung</th>
                      <th className="px-3 py-2">Rückzahlung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paare.map((p) => (
                      <tr key={p.a.id + p.b.id} className={`border-t border-neutral-800 ${p.rueckzahlung ? "opacity-60" : ""}`}>
                        <td className="px-3 py-1.5">
                          <div className="text-white">{p.empfaenger || "–"}</div>
                          <div className="text-xs text-neutral-500">Rechnung {p.rechnungsnummer}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-white">{formatEuro(p.betrag)}</td>
                        {[p.a, p.b].map((z) => (
                          <td key={z.id} className="px-3 py-1.5">
                            <Link href={`/kosten/${z.id}`} prefetch={false} className="text-white underline hover:text-neutral-300">
                              {formatDatum(z.datum)}
                            </Link>
                            <div className="text-xs text-neutral-500">{z.kostenart}</div>
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-xs">
                          {p.rueckzahlung ? (
                            <Link href={`/kosten/${p.rueckzahlung.id}`} prefetch={false} className="text-green-400 underline">
                              gebucht am {formatDatum(p.rueckzahlung.datum)}
                            </Link>
                          ) : (
                            <span className="text-amber-400">offen</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 max-w-2xl text-xs text-neutral-500">
                Bei einer echten Doppelzahlung die Rückzahlung als negative Kostenposition derselben Kostenart
                mit demselben Gebäude bzw. derselben Wohnung buchen (Kosten → Neue Kostenposition oder per
                Kontoauszug-Import).
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
