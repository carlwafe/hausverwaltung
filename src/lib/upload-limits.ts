// Next.js begrenzt den Body einer Server Action standardmäßig auf 1 MB; next.config.ts hebt das
// Gesamtlimit für mehrere Dateien in einem Upload an, aber jede einzelne Datei muss weiterhin
// darunter bleiben (sonst wäre schon eine einzelne zu groß). Von FotosSektion und BelegeSektion
// genutzt, damit beide dieselbe Grenze durchsetzen.
export const MAX_DATEIGROESSE_BYTES = 1024 * 1024;

// Für einzelne, größere Dokumente (z.B. eingescannte Dienstleister-Verträge). Vercel lässt bei
// Serverless-Funktionen nur 4,5 MB Request-Body zu — 4 MB pro Datei lässt Platz für den
// Multipart-Overhead, deshalb pro Upload nur eine Datei.
export const MAX_DOKUMENT_GROESSE_BYTES = 4 * 1024 * 1024;

export function ermittleZuGrosseDateien(files: FileList | null, maxBytes = MAX_DATEIGROESSE_BYTES): File[] {
  return [...(files ?? [])].filter((f) => f.size > maxBytes);
}
