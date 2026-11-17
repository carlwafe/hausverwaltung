"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SuchGruppe } from "@/lib/suche-typen";

// Suchfeld der Startseite. Fragt erst nach kurzer Tipppause und ab 2 Zeichen `/api/suche` ab; eine noch laufende
// ältere Anfrage wird abgebrochen. Nichts wird vorab geladen (CPU-Regeln: docs/deployment-vercel.md).
export function GlobaleSuche() {
  const [eingabe, setEingabe] = useState("");
  const [gruppen, setGruppen] = useState<SuchGruppe[] | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState(false);
  const abbruch = useRef<AbortController | null>(null);

  const q = eingabe.trim();
  const abfragbar = q.length >= 2;

  useEffect(() => {
    abbruch.current?.abort();
    if (!abfragbar) return;
    const controller = new AbortController();
    abbruch.current = controller;
    const timer = setTimeout(async () => {
      setLaedt(true);
      try {
        const antwort = await fetch(`/api/suche?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!antwort.ok) throw new Error(String(antwort.status));
        const daten = (await antwort.json()) as { gruppen: SuchGruppe[] };
        setGruppen(daten.gruppen);
        setFehler(false);
        setLaedt(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setFehler(true);
        setLaedt(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, abfragbar]);

  return (
    <div className="mb-6 max-w-[70rem]">
      <input
        type="search"
        value={eingabe}
        onChange={(e) => setEingabe(e.target.value)}
        placeholder="Suche etwas … (Mieter, Wohnung, Dienstleister, Ticket, Buchung)"
        aria-label="Suche"
        autoComplete="off"
        className="h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm text-white outline-none focus:border-neutral-400"
      />
      {abfragbar && (
        <div className="mt-2 rounded-lg border border-neutral-800 p-3">
          {fehler ? (
            <p className="text-sm text-red-400">Suche fehlgeschlagen. Bitte noch einmal versuchen.</p>
          ) : gruppen === null || (laedt && gruppen.length === 0) ? (
            <p className="text-sm text-neutral-400">Suche …</p>
          ) : gruppen.length === 0 ? (
            <p className="text-sm text-neutral-400">Nichts gefunden.</p>
          ) : (
            <div className={`flex flex-col gap-4 ${laedt ? "opacity-60" : ""}`}>
              {gruppen.map((g) => (
                <section key={g.titel}>
                  <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{g.titel}</h2>
                  <ul>
                    {g.treffer.map((t) => (
                      <li key={t.href}>
                        <Link
                          href={t.href}
                          prefetch={false}
                          className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-neutral-900 sm:flex-row sm:items-baseline sm:gap-3"
                        >
                          <span className="text-sm text-white">
                            {t.titel}
                            {t.marke && (
                              <span className="ml-2 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">{t.marke}</span>
                            )}
                          </span>
                          {t.zusatz && <span className="truncate text-xs text-neutral-400">{t.zusatz}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
