// Links auf die Datei eines Dokuments (Route /api/dokumente/[id]/download). Ohne Prisma-Import,
// damit Client-Komponenten sie nutzen können.
//
// Ansehen: PDFs und Bilder zeigt der Browser in einem neuen Tab selbst an (PDF-Betrachter mit Zoom,
// Suche, Drucken), nichts landet im Download-Ordner. Herunterladen: ?download=1 erzwingt das Speichern.

export function dokumentAnsehenUrl(id: string): string {
  return `/api/dokumente/${id}/download`;
}

export function dokumentHerunterladenUrl(id: string): string {
  return `/api/dokumente/${id}/download?download=1`;
}

/** Kleiner Knopf mit Download-Symbol neben einem Ansehen-Link. */
export function HerunterladenLink({ id, className = "" }: { id: string; className?: string }) {
  return (
    <a
      href={dokumentHerunterladenUrl(id)}
      title="Herunterladen"
      aria-label="Herunterladen"
      className={`inline-flex shrink-0 items-center justify-center rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white ${className}`}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
        <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
