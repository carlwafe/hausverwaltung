export type CsvSpalte<T> = { label: string; wert: (row: T) => string | number };

function escapeCsvFeld(value: string | number): string {
  const text = String(value);
  // Semikolon als Trenner (wie die Sparkasse-Kontoauszüge, die diese App sonst importiert) statt
  // Komma — deutsches Excel erwartet dasselbe Format beim Öffnen ohne Import-Assistent.
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Löst einen Datei-Download im Browser aus – kein Server-Roundtrip nötig, die Zeilen liegen bereits geladen im Client vor. */
export function exportiereAlsCsv<T>(dateiname: string, spalten: CsvSpalte<T>[], rows: T[]) {
  const zeilen = [
    spalten.map((s) => escapeCsvFeld(s.label)),
    ...rows.map((row) => spalten.map((s) => escapeCsvFeld(s.wert(row)))),
  ];
  // BOM am Anfang, damit Excel unter Windows/macOS die UTF-8-Kodierung (Umlaute) korrekt erkennt
  // statt sie als Mojibake darzustellen.
  const inhalt = "﻿" + zeilen.map((z) => z.join(";")).join("\r\n");
  const blob = new Blob([inhalt], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dateiname;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatEuroFuerCsv(value: number): string {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDatumFuerCsv(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export function heutigesDatumFuerDateiname(): string {
  return new Date().toISOString().slice(0, 10);
}
