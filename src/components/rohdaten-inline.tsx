"use client";

export function RohdatenToggleButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
