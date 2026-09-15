"use client";

import { useRef } from "react";

export function RohdatenToggleButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Das Ein-/Ausblenden fügt direkt unter der Zeile eine zusätzliche Tabellenzeile ein/entfernt
  // sie — dadurch verschieben sich alle darunterliegenden Zeilen vertikal, was in einer langen
  // Liste (viele sichtbare Zeilen, z.B. frisch importiert unter "Vorschlag übernommen") zu einem
  // sichtbaren Sprung der Seite führt, weil der Browser die Scroll-Position nicht automatisch an
  // diese Verschiebung anpasst (in Safari besonders auffällig). Fix unabhängig vom genauen
  // Auslöser: die Bildschirmposition dieses Buttons vor dem Klick merken, nach dem Re-Render
  // (nächster Frame) erneut messen und die Differenz per scrollBy ausgleichen — der Button (und
  // damit der sichtbare Ausschnitt) bleibt dadurch exakt an derselben Stelle stehen.
  function handleClick() {
    const el = buttonRef.current;
    const vorher = el?.getBoundingClientRect().top ?? null;
    onClick();
    if (vorher === null) return;
    requestAnimationFrame(() => {
      const nachher = el?.getBoundingClientRect().top;
      if (nachher === undefined) return;
      const delta = nachher - vorher;
      if (delta !== 0) window.scrollBy(0, delta);
    });
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      onMouseDown={(e) => e.preventDefault()}
      className="text-xs text-neutral-400 underline hover:text-white"
    >
      {expanded ? "Rohdaten ausblenden" : "Rohdaten"}
    </button>
  );
}

// Wird als zusätzliche Tabellenzeile direkt unter der Buchung eingeblendet (statt in einem
// separaten Fenster), damit beim Zuordnen mehrerer ähnlicher Buchungen (z.B. mehrere Stadtwerke-
// Positionen auf einen Blick) nicht mehr nachvollzogen werden muss, zu welcher Zeile die gerade
// geschlossenen Rohdaten gehörten.
export function RohdatenZeile({
  rohdaten,
  colSpan,
  downloadHref,
  downloadLabel,
}: {
  rohdaten: Record<string, string>;
  colSpan: number;
  downloadHref?: string;
  downloadLabel?: string;
}) {
  return (
    <tr className="border-t border-neutral-800 bg-neutral-900/50">
      <td colSpan={colSpan} className="px-4 py-3">
        {downloadHref && (
          <a href={downloadHref} className="mb-2 block text-sm text-white underline">
            {downloadLabel}
          </a>
        )}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(rohdaten)
            .filter(([, v]) => v)
            .map(([key, value]) => (
              <div key={key} className="min-w-0">
                <dt className="text-neutral-500">{key}</dt>
                <dd className="break-words text-neutral-200">{value}</dd>
              </div>
            ))}
        </dl>
      </td>
    </tr>
  );
}
