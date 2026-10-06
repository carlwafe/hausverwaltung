// Next.js begrenzt den Body einer Server Action standardmäßig auf 1 MB; next.config.ts hebt das
// Gesamtlimit für mehrere Dateien in einem Upload an, aber jede einzelne Datei muss weiterhin
// darunter bleiben (sonst wäre schon eine einzelne zu groß). Von FotosSektion und BelegeSektion
// genutzt, damit beide dieselbe Grenze durchsetzen.
export const MAX_DATEIGROESSE_BYTES = 1024 * 1024;

// Für einzelne Dokumente (Dienstleister-Verträge, zentraler Upload, Schreiben-Kopien). Entscheidung:
// gleiche Grenze wie bei Belegen und Fotos (1 MB) — komprimierte Scans reichen dafür; ein früheres
// Limit von 4 MB (Vercel erlaubt nur 4,5 MB Request-Body) wurde am 06.10.2026 wieder gesenkt, damit
// Speicher und Blob-Verbrauch klein bleiben. Der Name bleibt, damit die Stellen weiter getrennt
// anpassbar sind.
export const MAX_DOKUMENT_GROESSE_BYTES = MAX_DATEIGROESSE_BYTES;

export function ermittleZuGrosseDateien(files: FileList | null, maxBytes = MAX_DATEIGROESSE_BYTES): File[] {
  return [...(files ?? [])].filter((f) => f.size > maxBytes);
}
