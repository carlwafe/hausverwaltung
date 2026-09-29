import { normalizeText } from "./bank-csv";

// Ein Dienstleister aus den Stammdaten, aufbereitet für den Kosten-Import: die normalisierten
// Suchbegriffe werden gegen Empfänger und Verwendungszweck der Kontoauszugszeile gehalten.
export type DienstleisterKandidat = {
  id: string;
  name: string;
  suchbegriffe: string[];
  // Leer = keine feste Kostenart, mehrere = Dienstleister deckt mehrere Kostenarten ab.
  kostenartIds: string[];
  // "gebaeude:<id>"/"haus:<id>"/... wie im Auswahl-<select>, null = nicht festgelegt.
  gebaeudeAuswahl: string | null;
};

/** Zerlegt das Suchbegriffe-Textfeld (ein Begriff pro Zeile oder durch Komma/Semikolon getrennt). */
export function parseSuchbegriffe(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => normalizeText(s).length >= 3);
}

/**
 * Findet den Dienstleister zu einer Bankzeile. Treffer, wenn ein Suchbegriff (normalisiert) im
 * Empfänger oder Verwendungszweck vorkommt; bei mehreren Treffern gewinnt der mit dem längsten,
 * also spezifischsten Suchbegriff. Ein Treffer im Empfängernamen hat Vorrang vor einem im
 * Verwendungszweck.
 */
export function findeDienstleister(
  empfaenger: string,
  verwendungszweck: string,
  dienstleister: DienstleisterKandidat[],
): DienstleisterKandidat | null {
  const normEmpfaenger = normalizeText(empfaenger);
  const normZweck = normalizeText(verwendungszweck);
  let bester: { d: DienstleisterKandidat; score: number } | null = null;
  for (const d of dienstleister) {
    for (const begriff of d.suchbegriffe) {
      const norm = normalizeText(begriff);
      if (!norm) continue;
      const imEmpfaenger = normEmpfaenger.includes(norm);
      if (!imEmpfaenger && !normZweck.includes(norm)) continue;
      const score = norm.length + (imEmpfaenger ? 1000 : 0);
      if (!bester || score > bester.score) bester = { d, score };
    }
  }
  return bester?.d ?? null;
}
