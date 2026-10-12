// Überleitung der Jahresübersicht auf die Zeilen der Anlage V (Einkünfte aus Vermietung und
// Verpachtung). Reine Rechenlogik ohne Prisma, damit auch Client-Komponenten die Bezeichnungen nutzen.

export const ANLAGE_V_ZEILEN = [
  "ERHALTUNGSAUFWAND",
  "BETRIEBSKOSTEN",
  "VERWALTUNG",
  "SONSTIGES",
  "SONSTIGE_EINNAHMEN",
] as const;

export type AnlageVZeile = (typeof ANLAGE_V_ZEILEN)[number];

export const ANLAGE_V_ZEILE_LABEL: Record<AnlageVZeile, string> = {
  ERHALTUNGSAUFWAND: "Z. 40 — Erhaltungsaufwand (Reparaturen, voll abziehbar)",
  BETRIEBSKOSTEN: "Z. 47 — Grundsteuer, Wasser, Heizung, Versicherungen, Hauswart … (laufende Betriebskosten)",
  VERWALTUNG: "Z. 48 — Verwaltungskosten",
  SONSTIGES: "Z. 50 — Sonstiges",
  SONSTIGE_EINNAHMEN: "Z. 19 — sonstige Einnahmen (z.B. Waschgeld, Gebühren)",
};

export const ANLAGE_V_ZEILE_KURZ: Record<AnlageVZeile, string> = {
  ERHALTUNGSAUFWAND: "Z. 40",
  BETRIEBSKOSTEN: "Z. 47",
  VERWALTUNG: "Z. 48",
  SONSTIGES: "Z. 50",
  SONSTIGE_EINNAHMEN: "Z. 19",
};

type KostenartFuerZuordnung = {
  name: string;
  umlagefaehig: boolean;
  anlageVZeile: AnlageVZeile | null;
};

// Vorschlag, solange an der Kostenart nichts gewählt ist: umlagefähig = laufende Betriebskosten
// (Z. 47); sonst nach dem Namen. Nicht umlagefähige Betriebskosten (z.B. Strom/Versicherung der
// Garagen) und Anschaffungs-/Herstellungskosten (Modernisierung, Sanierung — nicht als
// Erhaltungsaufwand, sondern ggf. über die AfA) bleiben bewusst bei „Sonstiges“ und müssen von Hand
// zugeordnet werden.
export function vorschlagAnlageVZeile(k: Pick<KostenartFuerZuordnung, "name" | "umlagefaehig">): AnlageVZeile {
  const name = k.name.toLowerCase();
  if (/einnahmen|mahngeb/.test(name)) return "SONSTIGE_EINNAHMEN";
  if (k.umlagefaehig) return "BETRIEBSKOSTEN";
  if (/verwaltung|vermietung|geldverkehr/.test(name)) return "VERWALTUNG";
  if (/reparatur/.test(name)) return "ERHALTUNGSAUFWAND";
  return "SONSTIGES";
}

export function anlageVZeileFuer(k: KostenartFuerZuordnung): { zeile: AnlageVZeile; automatisch: boolean } {
  if (k.anlageVZeile) return { zeile: k.anlageVZeile, automatisch: false };
  return { zeile: vorschlagAnlageVZeile(k), automatisch: true };
}

export type AnlageVKostenSumme = {
  name: string;
  zeile: AnlageVZeile;
  automatisch: boolean;
  summe: number;
};

export type AnlageVUeberleitung = {
  // Einnahmen
  mieteUndUmlagen: number; // Z. 9–13: Mietzahlungen + Nachzahlungen − ausgezahlte Guthaben
  kautionEinbehalte: number; // Z. 15
  sonstigeEinnahmen: number; // Z. 19
  summeEinnahmen: number; // Z. 21
  // Werbungskosten je Zeile (nur Kostenpositionen), Z. 40/47/48/50
  werbungskosten: Record<Exclude<AnlageVZeile, "SONSTIGE_EINNAHMEN">, number>;
  summeWerbungskosten: number; // Z. 22/51 (ohne AfA und Schuldzinsen, die noch nicht erfasst sind)
  ueberschuss: number; // Z. 23 vor AfA und Schuldzinsen
};

const gerundet = (n: number) => Math.round(n * 100) / 100;

// Setzt die Summen des Jahresberichts nach der Struktur der Anlage V zusammen. Das Ergebnis ist
// dasselbe wie im Jahresbericht (Einnahmen − Ausgaben), nur anders gegliedert: Das Finanzamt saldiert
// ausgezahlte NK-Guthaben mit den Umlagen (Z. 13) statt sie als Ausgabe zu führen.
export function baueAnlageVUeberleitung(eingabe: {
  mieteinnahmen: number;
  nachzahlungenEingezogen: number;
  guthabenAusgezahlt: number;
  kautionEinbehalte: number;
  sonderzahlungen: number;
  // Übrige eur-relevante Buchungen ohne eigene Kategorie: positiv = Einnahme, negativ = Ausgabe.
  sonstigeEurRelevant: number;
  kosten: AnlageVKostenSumme[];
}): AnlageVUeberleitung {
  const werbungskosten = { ERHALTUNGSAUFWAND: 0, BETRIEBSKOSTEN: 0, VERWALTUNG: 0, SONSTIGES: 0 };
  let sonstigeEinnahmen = eingabe.sonderzahlungen + Math.max(eingabe.sonstigeEurRelevant, 0);
  werbungskosten.SONSTIGES += Math.max(-eingabe.sonstigeEurRelevant, 0);
  for (const k of eingabe.kosten) {
    // Kostenposition: positiv = Ausgabe, negativ = Gutschrift/Einnahme.
    if (k.zeile === "SONSTIGE_EINNAHMEN") sonstigeEinnahmen += -k.summe;
    else werbungskosten[k.zeile] += k.summe;
  }

  const mieteUndUmlagen = eingabe.mieteinnahmen + eingabe.nachzahlungenEingezogen - eingabe.guthabenAusgezahlt;
  const summeEinnahmen = mieteUndUmlagen + eingabe.kautionEinbehalte + sonstigeEinnahmen;
  const summeWerbungskosten =
    werbungskosten.ERHALTUNGSAUFWAND + werbungskosten.BETRIEBSKOSTEN + werbungskosten.VERWALTUNG + werbungskosten.SONSTIGES;

  return {
    mieteUndUmlagen: gerundet(mieteUndUmlagen),
    kautionEinbehalte: gerundet(eingabe.kautionEinbehalte),
    sonstigeEinnahmen: gerundet(sonstigeEinnahmen),
    summeEinnahmen: gerundet(summeEinnahmen),
    werbungskosten: {
      ERHALTUNGSAUFWAND: gerundet(werbungskosten.ERHALTUNGSAUFWAND),
      BETRIEBSKOSTEN: gerundet(werbungskosten.BETRIEBSKOSTEN),
      VERWALTUNG: gerundet(werbungskosten.VERWALTUNG),
      SONSTIGES: gerundet(werbungskosten.SONSTIGES),
    },
    summeWerbungskosten: gerundet(summeWerbungskosten),
    ueberschuss: gerundet(summeEinnahmen - summeWerbungskosten),
  };
}
