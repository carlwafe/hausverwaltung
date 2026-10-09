"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ordneDokumentZu } from "../../dokumente/actions";

export type EingangTreffer = {
  dokumentId: string;
  dateiname: string;
  aussteller: string | null;
  rechnungsnummer: string | null;
  betragText: string | null;
  gruende: string[];
  sicher: boolean;
};

// Hinweis auf der Kostenposition: Dokumente im Eingang, die zu dieser Zahlung passen (Betrag, Rechnungsnummer,
// Aussteller …). „Als Beleg zuordnen“ hängt das Dokument als festen Beleg an diese Position.
export function EingangHinweis({ buchungId, treffer }: { buchungId: string; treffer: EingangTreffer[] }) {
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-1 text-lg font-medium text-white">Passende Dokumente im Eingang ({treffer.length})</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Aus dem Eingang der Ablage — gefunden über Betrag, Rechnungsnummer und Aussteller. Die Kostenposition als Bezug lässt sich danach nicht mehr ändern (fester Nachweis); weitere Bezüge wie Gebäude oder Dienstleister ergänzt du auf der Detailseite des Dokuments.
      </p>
      <ul className="divide-y divide-neutral-800">
        {treffer.map((t) => (
          <li key={t.dokumentId} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="min-w-0 text-sm">
              <Link href={`/dokumente/${t.dokumentId}`} className="text-white [overflow-wrap:anywhere] hover:underline">
                {t.dateiname}
              </Link>
              {t.sicher && <span className="ml-2 rounded-full bg-green-950 px-2 py-0.5 text-[10px] uppercase text-green-400">sicher</span>}
              <div className="text-xs text-neutral-500">
                {[t.aussteller, t.rechnungsnummer && `Nr. ${t.rechnungsnummer}`, t.betragText].filter(Boolean).join(" · ")}
              </div>
              <div className="text-xs text-neutral-400">{t.gruende.join(" · ")}</div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm(`„${t.dateiname}“ als Beleg an diese Kostenposition hängen? Die Kostenposition lässt sich danach nicht mehr ändern.`)) return;
                setFehler(null);
                startTransition(async () => {
                  const f = await ordneDokumentZu(t.dokumentId, "buchung", buchungId);
                  if (typeof f === "string") setFehler(f);
                });
              }}
              className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              Als Beleg zuordnen
            </button>
          </li>
        ))}
      </ul>
      {fehler && <p className="mt-2 text-sm text-red-400">{fehler}</p>}
    </div>
  );
}
