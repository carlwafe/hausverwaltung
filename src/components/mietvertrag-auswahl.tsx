"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Durchsuchbares Auswahlfeld statt eines langen <select> — die Mietvertragsliste (eine Zeile pro
// Einheit/Mieter) ist bei 63 Einheiten lang, ein reines Dropdown ist damit unhandlich zu
// durchsuchen. Zeigt beim Fokussieren ein Textfeld statt des aktuell gewählten Labels (leer zum
// Tippen), filtert die Kandidaten per Teilstring-Suche und schließt beim Verlassen des Felds
// wieder — ein Klick auf einen Dropdown-Eintrag löst dank onMouseDown-preventDefault kein Blur
// aus, bevor der Klick ausgewertet wird. Generisch gehalten (nicht nur Mietverträge) — wird auch
// für die Auswahl offener Nebenkostenabrechnung-Positionen wiederverwendet.
export function MietvertragAuswahl({
  kandidaten,
  value,
  onChange,
  leerLabel,
  size = "sm",
}: {
  kandidaten: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  leerLabel: string;
  /** "sm" (Standard) passt in eine schmale Tabellenzelle, "md" in ein reguläres Formularfeld. */
  size?: "sm" | "md";
}) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  // Das Dropdown wird per Portal direkt unter <body> gerendert statt im DOM-Baum stehen zu
  // bleiben: eine abgeblendete ("opacity-50") Ahnen-Zeile würde sonst auch das Panel abdunkeln,
  // selbst wenn es optisch aus der Zeile herausragt. Position wird beim Öffnen einmalig aus der
  // Bounding-Box des Eingabefelds berechnet; ein Scroll außerhalb des Panels währenddessen
  // schließt es, statt eine veraltete Position stehen zu lassen.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const aktuellesLabel = kandidaten.find((k) => k.id === value)?.label ?? "";
  const sucheNorm = suche.trim().toLowerCase();
  const gefiltert = sucheNorm
    ? kandidaten.filter((k) => k.label.toLowerCase().includes(sucheNorm))
    : // Ohne Sucheingabe (z.B. direkt nach dem Fokussieren) steht die aktuelle Auswahl ganz oben —
      // sie ist sonst je nach Position in der Kandidatenliste nur durch Scrollen auffindbar, obwohl
      // man beim Öffnen meist genau sie sucht.
      [...kandidaten].sort((a, b) => (a.id === value ? -1 : b.id === value ? 1 : 0));

  function auswaehlen(id: string) {
    onChange(id);
    setSuche("");
    setOffen(false);
  }

  function oeffnen() {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOffen(true);
    setSuche("");
  }

  useEffect(() => {
    if (!offen) return;
    function schliessenBeiScroll(e: Event) {
      // Scrollen INNERHALB des Panels (die Kandidatenliste selbst ist scrollbar) soll es nicht
      // schließen — nur ein Scroll anderswo, der die berechnete Position veralten lassen würde.
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOffen(false);
    }
    // capture:true, damit auch Scrollen innerhalb eines Containers (nicht nur des Fensters) erfasst wird
    window.addEventListener("scroll", schliessenBeiScroll, true);
    return () => window.removeEventListener("scroll", schliessenBeiScroll, true);
  }, [offen]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={offen ? suche : aktuellesLabel || leerLabel}
        onChange={(e) => setSuche(e.target.value)}
        onFocus={oeffnen}
        onBlur={() => {
          setOffen(false);
          setSuche("");
        }}
        placeholder="Suchen…"
        className={`w-full rounded-md border border-neutral-700 bg-transparent outline-none focus:border-neutral-400 ${
          size === "md" ? "px-3 py-2 text-sm" : "px-2 py-1 text-xs"
        } ${value ? "text-white" : "text-neutral-500"}`}
      />
      {offen &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: position.top, left: position.left, minWidth: position.width }}
            className="fixed z-50 max-h-56 w-max max-w-[26rem] overflow-auto rounded-md border border-neutral-800 bg-neutral-950 py-1 shadow-lg"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => auswaehlen("")}
              className="block w-full whitespace-nowrap px-2 py-1 text-left text-xs text-neutral-400 hover:bg-neutral-900 hover:text-white"
            >
              {leerLabel}
            </button>
            {gefiltert.map((k) => (
              <button
                key={k.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => auswaehlen(k.id)}
                className={`block w-full whitespace-nowrap px-2 py-1 text-left text-xs hover:bg-neutral-900 hover:text-white ${
                  k.id === value ? "font-medium text-white" : "text-neutral-300"
                }`}
              >
                {k.label}
              </button>
            ))}
            {gefiltert.length === 0 && (
              <div className="px-2 py-1 text-xs text-neutral-500">Keine Treffer.</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
