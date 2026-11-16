"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

export type AnsichtTab = {
  key: string;
  label: string;
  /** Anzahl Zeilen, die der Reiter zeigt (neben dem Namen). */
  anzahl?: number;
  /** Der Reiter folgt dem Zeitraumfilter (und zeigt ihn an). */
  mitZeitraum?: boolean;
  /** Erklärung unter den Reitern. */
  hinweis?: string;
  inhalt: ReactNode;
};

/**
 * Reiter der Kontostand-Seite. Der Wechsel zwischen den Reitern läuft im Browser (kostet keine Serverzeit);
 * nur der Zeitraum ist ein Link, weil der Server dann weniger Zeilen schickt — er merkt sich den offenen Reiter
 * über `?ansicht=`. Es wird immer nur der offene Reiter gezeichnet.
 */
export function KontostandAnsicht({
  tabs,
  start,
  zeitraum,
  zeitraeume,
}: {
  tabs: AnsichtTab[];
  start: string;
  zeitraum: string;
  zeitraeume: { wert: string; label: string }[];
}) {
  const [aktiv, setAktiv] = useState(tabs.some((t) => t.key === start) ? start : tabs[0].key);
  const tab = tabs.find((t) => t.key === aktiv) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-neutral-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab.key}
            onClick={() => setAktiv(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              t.key === tab.key
                ? "border-white text-white"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            {t.label}
            {t.anzahl !== undefined && <span className="ml-1.5 text-xs text-neutral-500">{t.anzahl}</span>}
          </button>
        ))}
      </div>

      {tab.mitZeitraum && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
          <span>Zeitraum:</span>
          {zeitraeume.map((z) => (
            <Link
              key={z.wert}
              prefetch={false}
              href={`/kontostand?zeitraum=${z.wert}&ansicht=${tab.key}`}
              aria-current={z.wert === zeitraum ? "true" : undefined}
              className={`rounded-full border px-3 py-1 text-xs ${
                z.wert === zeitraum
                  ? "border-white text-white"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-400 hover:text-white"
              }`}
            >
              {z.label}
            </Link>
          ))}
        </div>
      )}

      {tab.hinweis && <p className="mb-3 max-w-2xl text-xs text-neutral-500">{tab.hinweis}</p>}

      {tab.inhalt}
    </div>
  );
}
