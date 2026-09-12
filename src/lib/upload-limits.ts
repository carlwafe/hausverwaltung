// Next.js begrenzt den Body einer Server Action standardmäßig auf 1 MB; next.config.ts hebt das
// Gesamtlimit für mehrere Dateien in einem Upload an, aber jede einzelne Datei muss weiterhin
// darunter bleiben (sonst wäre schon eine einzelne zu groß). Von FotosSektion und BelegeSektion
// genutzt, damit beide dieselbe Grenze durchsetzen.
export const MAX_DATEIGROESSE_BYTES = 1024 * 1024;

export function ermittleZuGrosseDateien(files: FileList | null): File[] {
  return [...(files ?? [])].filter((f) => f.size > MAX_DATEIGROESSE_BYTES);
}
