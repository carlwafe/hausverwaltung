// Aufstellung für die Steuererklärung (Anlage V): Einnahmen und Kosten so gegliedert, wie der
// Steuerberater sie braucht — Mieten und Nebenkosten getrennt, Instandhaltung separat, übrige Kosten
// nach umlagefähig / nicht umlagefähig. Reine Rechenlogik ohne Prisma, damit auch Client-Komponenten
// die Bezeichnungen nutzen.

// Werte des Prisma-Enums `AnlageVZeile` (Kostenart.anlageVZeile). Angeboten werden im Formular nur
// ERHALTUNGSAUFWAND und SONSTIGE_EINNAHMEN; die übrigen stammen aus der ersten Fassung (Zeilen 47/48/50)
// und gelten wie „automatisch“.
export const ANLAGE_V_ZEILEN = [
  "ERHALTUNGSAUFWAND",
  "BETRIEBSKOSTEN",
  "VERWALTUNG",
  "SONSTIGES",
  "SONSTIGE_EINNAHMEN",
] as const;
export type AnlageVZeile = (typeof ANLAGE_V_ZEILEN)[number];

export const WAHL_IM_FORMULAR = ["ERHALTUNGSAUFWAND", "SONSTIGE_EINNAHMEN"] as const;

export type Kostengruppe = "INSTANDHALTUNG" | "UMLAGEFAEHIG" | "NICHT_UMLAGEFAEHIG" | "EINNAHME";

export const KOSTENGRUPPE_LABEL: Record<Kostengruppe, string> = {
  INSTANDHALTUNG: "Instandhaltung",
  UMLAGEFAEHIG: "Umlagefähig",
  NICHT_UMLAGEFAEHIG: "Nicht umlagefähig",
  EINNAHME: "Sonstige Einnahme",
};

type KostenartFuerZuordnung = {
  name: string;
  umlagefaehig: boolean;
  anlageVZeile: AnlageVZeile | null;
};

// Vorschlag, solange an der Kostenart nichts gewählt ist: nach dem Namen Einnahmen (Waschgeld,
// Mahngebühren) und Reparaturen, sonst nach der Umlagefähigkeit. Sanierung/Modernisierung bleiben
// bewusst „nicht umlagefähig“ — ob es Instandhaltung oder Herstellungskosten (AfA) ist, entscheidet
// der Eigentümer mit dem Steuerberater und wird von Hand an der Kostenart gesetzt.
export function vorschlagKostengruppe(k: Pick<KostenartFuerZuordnung, "name" | "umlagefaehig">): Kostengruppe {
  const name = k.name.toLowerCase();
  if (/einnahmen|mahngeb/.test(name)) return "EINNAHME";
  if (/reparatur/.test(name)) return "INSTANDHALTUNG";
  return k.umlagefaehig ? "UMLAGEFAEHIG" : "NICHT_UMLAGEFAEHIG";
}

export function kostengruppeFuer(k: KostenartFuerZuordnung): { gruppe: Kostengruppe; automatisch: boolean } {
  if (k.anlageVZeile === "ERHALTUNGSAUFWAND") return { gruppe: "INSTANDHALTUNG", automatisch: false };
  if (k.anlageVZeile === "SONSTIGE_EINNAHMEN") return { gruppe: "EINNAHME", automatisch: false };
  return { gruppe: vorschlagKostengruppe(k), automatisch: true };
}

export type KostenSumme = {
  name: string;
  gruppe: Kostengruppe;
  automatisch: boolean;
  summe: number;
};

export type AnlageVAufstellung = {
  mieten: number; // vereinnahmte Kaltmiete (netto)
  umsatzsteuer: number; // vereinnahmte Umsatzsteuer auf Garagenmieten
  nebenkosten: number; // vereinnahmte NK-Vorauszahlungen + Nachzahlungen − ausgezahlte Guthaben
  // Bestandteile von nebenkosten (für die „davon“-Zeilen)
  nkVorauszahlungen: number;
  nkNachzahlungen: number;
  nkGuthaben: number; // ausgezahlt, als positiver Betrag
  // Einbehalte aus Kautionen, nach Art den Zeilen zugeordnet (Summen sind schon in mieten/nebenkosten/
  // sonstigeEinnahmen enthalten, hier nur für Hinweise und die Auflistung)
  kautionMitNk: number; // mit Nachzahlung der Nebenkostenabrechnung verrechnet
  kautionMitMiete: number; // mit Mietrückstand/Miete (Mieterkonto) verrechnet
  kautionPauschal: number; // pauschal einbehalten (Schlüssel, Gebühren …)
  sonstigeEinnahmen: number;
  // Bestandteile von sonstigeEinnahmen außer den Kostenarten-Gutschriften (für die Auflistung im Export)
  sonderzahlungen: number; // Zahlungen von Mietern auf Gebühren-Forderungen
  uebrigeEinnahmen: number; // übrige eur-relevante Buchungen ohne eigene Kategorie
  summeEinnahmen: number;
  instandhaltung: number;
  umlagefaehig: number;
  nichtUmlagefaehig: number;
  summeKosten: number;
  ueberschuss: number; // vor AfA und Schuldzinsen, nach 10-Tage-Regel
  // 10-Tage-Regel für die Mieteinnahmen: ueberschuss = ueberschussBericht + abgrenzungHinzu − abgrenzungHeraus
  ueberschussBericht: number; // Ergebnis des Jahresberichts (Zahlungsdatum)
  abgrenzungHinzu: number; // Dezember-Zahlungen des Vorjahres für den Januar des Berichtsjahres
  anzahlHinzu: number;
  abgrenzungHeraus: number; // Dezember-Zahlungen des Berichtsjahres für den Januar des Folgejahres
  anzahlHeraus: number;
};

const gerundet = (n: number) => Math.round(n * 100) / 100;

// Setzt die Summen des Jahresberichts in der Gliederung des Steuerberaters zusammen. Das Ergebnis
// ist dasselbe wie im Jahresbericht (Einnahmen − Ausgaben); ausgezahlte NK-Guthaben mindern hier die
// Nebenkosten-Einnahmen (Anlage V, Z. 13) statt als Ausgabe zu erscheinen. Die Mietzahlungen sind nach der
// 10-Tage-Regel dem Jahr zugeordnet (siehe zuflussJahrMiete); die Abweichung zum Bericht steht in `abgrenzung`.
export function baueAnlageVAufstellung(eingabe: {
  kaltmiete: number; // netto, ohne Umsatzsteuer
  umsatzsteuer: number;
  nkVorauszahlungen: number;
  nachzahlungenEingezogen: number;
  guthabenAusgezahlt: number;
  kautionMitNk: number;
  kautionMitMiete: number;
  kautionPauschal: number;
  sonderzahlungen: number;
  // Übrige eur-relevante Buchungen ohne eigene Kategorie: positiv = Einnahme, negativ = Ausgabe.
  sonstigeEurRelevant: number;
  kosten: KostenSumme[];
  abgrenzung: { hinzu: number; anzahlHinzu: number; heraus: number; anzahlHeraus: number };
}): AnlageVAufstellung {
  let sonstigeEinnahmen = eingabe.sonderzahlungen + eingabe.kautionPauschal + Math.max(eingabe.sonstigeEurRelevant, 0);
  let instandhaltung = 0;
  let umlagefaehig = 0;
  let nichtUmlagefaehig = Math.max(-eingabe.sonstigeEurRelevant, 0);
  for (const k of eingabe.kosten) {
    // Kostenposition: positiv = Ausgabe, negativ = Gutschrift/Einnahme.
    if (k.gruppe === "EINNAHME") sonstigeEinnahmen += -k.summe;
    else if (k.gruppe === "INSTANDHALTUNG") instandhaltung += k.summe;
    else if (k.gruppe === "UMLAGEFAEHIG") umlagefaehig += k.summe;
    else nichtUmlagefaehig += k.summe;
  }

  const nebenkosten =
    eingabe.nkVorauszahlungen + eingabe.nachzahlungenEingezogen + eingabe.kautionMitNk - eingabe.guthabenAusgezahlt;
  const mieten = eingabe.kaltmiete + eingabe.kautionMitMiete;
  const summeEinnahmen = mieten + eingabe.umsatzsteuer + nebenkosten + sonstigeEinnahmen;
  const summeKosten = instandhaltung + umlagefaehig + nichtUmlagefaehig;

  return {
    mieten: gerundet(mieten),
    umsatzsteuer: gerundet(eingabe.umsatzsteuer),
    nebenkosten: gerundet(nebenkosten),
    nkVorauszahlungen: gerundet(eingabe.nkVorauszahlungen),
    nkNachzahlungen: gerundet(eingabe.nachzahlungenEingezogen + eingabe.kautionMitNk),
    nkGuthaben: gerundet(eingabe.guthabenAusgezahlt),
    kautionMitNk: gerundet(eingabe.kautionMitNk),
    kautionMitMiete: gerundet(eingabe.kautionMitMiete),
    kautionPauschal: gerundet(eingabe.kautionPauschal),
    sonstigeEinnahmen: gerundet(sonstigeEinnahmen),
    sonderzahlungen: gerundet(eingabe.sonderzahlungen),
    uebrigeEinnahmen: gerundet(Math.max(eingabe.sonstigeEurRelevant, 0)),
    summeEinnahmen: gerundet(summeEinnahmen),
    instandhaltung: gerundet(instandhaltung),
    umlagefaehig: gerundet(umlagefaehig),
    nichtUmlagefaehig: gerundet(nichtUmlagefaehig),
    summeKosten: gerundet(summeKosten),
    ueberschuss: gerundet(summeEinnahmen - summeKosten),
    ueberschussBericht: gerundet(summeEinnahmen - summeKosten - eingabe.abgrenzung.hinzu + eingabe.abgrenzung.heraus),
    abgrenzungHinzu: gerundet(eingabe.abgrenzung.hinzu),
    anzahlHinzu: eingabe.abgrenzung.anzahlHinzu,
    abgrenzungHeraus: gerundet(eingabe.abgrenzung.heraus),
    anzahlHeraus: eingabe.abgrenzung.anzahlHeraus,
  };
}
