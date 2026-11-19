// Monatssicht auf die CAMT-Importe: Die Sparkasse liefert eine XML-Datei je Buchungstag, gespeichert wird je
// Import eine zusammengeführte CSV „Kontoauszug CAMT <von> bis <bis>.csv“. Weil sich die Zeiträume der Importe
// eines Monats überschneiden, fasst die Seite /kontoauszug/importe sie zu einer Zeile je Monat zusammen und prüft
// die Vollständigkeit über alle Dateien des Monats. Ohne Prisma, damit auch Client-Komponenten es nutzen können.

const CAMT_DATEINAME = /^Kontoauszug CAMT (\d{4}-\d{2}-\d{2}) bis (\d{4}-\d{2}-\d{2})\.csv$/;

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Zeitraum (ISO von/bis) eines gespeicherten CAMT-Imports, sonst null (CSV-/Excel-Import). */
export function camtZeitraum(dateiname: string): { von: string; bis: string } | null {
  const m = dateiname.match(CAMT_DATEINAME);
  if (!m) return null;
  return m[1] <= m[2] ? { von: m[1], bis: m[2] } : { von: m[2], bis: m[1] };
}

/** Alle Monate (yyyy-mm), die der Zeitraum berührt. */
export function monateImZeitraum(von: string, bis: string): string[] {
  const monate: string[] = [];
  let [j, m] = von.slice(0, 7).split("-").map(Number);
  const ende = bis.slice(0, 7);
  for (;;) {
    const monat = `${j}-${String(m).padStart(2, "0")}`;
    monate.push(monat);
    if (monat >= ende) break;
    m++;
    if (m > 12) {
      m = 1;
      j++;
    }
  }
  return monate;
}

/** Erster und letzter Tag (ISO) eines Monats yyyy-mm. */
export function monatsGrenzen(monat: string): { erster: string; letzter: string } {
  const [j, m] = monat.split("-").map(Number);
  const tage = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return { erster: `${monat}-01`, letzter: `${monat}-${String(tage).padStart(2, "0")}` };
}

/** „Kontoauszug CAMT November 2026“ — Anzeigename der Monatszeile. */
export function camtMonatLabel(monat: string): string {
  const [j, m] = monat.split("-").map(Number);
  return `Kontoauszug CAMT ${MONATSNAMEN[m - 1]} ${j}`;
}
