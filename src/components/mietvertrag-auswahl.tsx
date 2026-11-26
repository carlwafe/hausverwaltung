"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Durchsuchbares Auswahlfeld statt eines langen <select> — die Mietvertragsliste (eine Zeile pro
// Einheit/Mieter) ist bei 63 Einheiten lang, ein reines Dropdown ist damit unhandlich zu
// durchsuchen. Zeigt beim Fokussieren ein Textfeld statt des aktuell gewählten Labels (leer zum
// Tippen), filtert die Kandidaten per Teilstring-Suche und schließt beim Verlassen des Felds
// wieder — ein Klick auf einen Dropdown-Eintrag löst dank onMouseDown-preventDefault kein Blur
// aus, bevor der Klick ausgewertet wird. Generisch gehalten (nicht nur Mietverträge) — wird auch
// für die Auswahl offener Betriebskostenabrechnung-Positionen wiederverwendet.
export function MietvertragAuswahl({
  kandidaten,
  defaultKandidaten,
  value,
  onChange,
  leerLabel,
  size = "sm",
}: {
  kandidaten: { id: string; label: string }[];
  /** Wird angezeigt, solange noch nichts gesucht wurde (z.B. eine sinnvolle Vorauswahl wie
   * "gleicher Tag") — bei Sucheingabe wird trotzdem über die volle `kandidaten`-Liste gesucht,
   * damit ältere Einträge weiterhin auffindbar bleiben. Ohne Angabe wie bisher: volle Liste. */
  defaultKandidaten?: { id: string; label: string }[];
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
  // selbst wenn es optisch aus der Zeile herausragt. Es steht absolut in Seitenkoordinaten (nicht
  // `fixed`): Auf dem Handy verschiebt Zoomen oder die Tastatur den sichtbaren Ausschnitt gegen den
  // Bezugsrahmen von `fixed`, das Panel landete dann neben dem Feld oder außerhalb des Bildschirms.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    /** Panel öffnet nach oben: `top` ist dann seine Unterkante. */
    nachOben: boolean;
    left: number;
    width: number;
    maxWidth: number;
    maxHeight: number;
  } | null>(null);

  const aktuellesLabel = kandidaten.find((k) => k.id === value)?.label ?? "";
  const sucheNorm = suche.trim().toLowerCase();
  const gefiltert = sucheNorm
    ? kandidaten.filter((k) => k.label.toLowerCase().includes(sucheNorm))
    : // Ohne Sucheingabe (z.B. direkt nach dem Fokussieren) steht die aktuelle Auswahl ganz oben —
      // sie ist sonst je nach Position in der Kandidatenliste nur durch Scrollen auffindbar, obwohl
      // man beim Öffnen meist genau sie sucht.
      [...(defaultKandidaten ?? kandidaten)].sort((a, b) => (a.id === value ? -1 : b.id === value ? 1 : 0));

  function auswaehlen(id: string) {
    onChange(id);
    setSuche("");
    setOffen(false);
  }

  // Position aus der Bounding-Box des Felds (plus Scroll-Versatz = Seitenkoordinaten) und dem
  // sichtbaren Bereich (visualViewport: auf dem Handy ohne Tastatur, beim Zoomen nur der Ausschnitt)
  // berechnen; bei zu wenig Platz darunter öffnet das Panel nach oben.
  function berechnePosition() {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vv = window.visualViewport;
    const sichtOben = vv?.offsetTop ?? 0;
    const sichtUnten = sichtOben + (vv?.height ?? window.innerHeight);
    const platzUnten = sichtUnten - rect.bottom - 8;
    const platzOben = rect.top - sichtOben - 8;
    const nachOben = !(platzUnten >= 140 || platzUnten >= platzOben);
    setPosition({
      top: (nachOben ? rect.top - 4 : rect.bottom + 4) + window.scrollY,
      nachOben,
      left: rect.left + window.scrollX,
      width: rect.width,
      // Nicht über den rechten Seitenrand hinaus (lange Einträge scrollen dann seitlich).
      maxWidth: Math.max(rect.width, document.documentElement.clientWidth - rect.left - 8),
      maxHeight: Math.max(96, Math.min(224, nachOben ? platzOben : platzUnten)),
    });
  }

  function oeffnen() {
    berechnePosition();
    setOffen(true);
    setSuche("");
  }

  useEffect(() => {
    if (!offen) return;
    // Scrollen/Größenänderung (auf dem Handy löst schon das Einblenden der Tastatur beides aus)
    // schließt das Panel nicht, sondern positioniert es neu — sonst verschwindet es sofort wieder.
    window.addEventListener("scroll", berechnePosition, true);
    window.addEventListener("resize", berechnePosition);
    window.visualViewport?.addEventListener("resize", berechnePosition);
    window.visualViewport?.addEventListener("scroll", berechnePosition);
    return () => {
      window.removeEventListener("scroll", berechnePosition, true);
      window.removeEventListener("resize", berechnePosition);
      window.visualViewport?.removeEventListener("resize", berechnePosition);
      window.visualViewport?.removeEventListener("scroll", berechnePosition);
    };
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
          size === "md" ? "h-10 px-3 text-sm" : "px-2 py-1 text-xs"
        } ${value ? "text-white" : "text-neutral-500"}`}
      />
      {offen &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              top: position.top,
              left: position.left,
              transform: position.nachOben ? "translateY(-100%)" : undefined,
              minWidth: position.width,
              maxWidth: Math.min(416, position.maxWidth),
              maxHeight: position.maxHeight,
            }}
            className="absolute z-50 w-max overflow-auto rounded-md border border-neutral-800 bg-neutral-950 py-1 shadow-lg"
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
