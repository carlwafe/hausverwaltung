// Aufbereitung der Aufstellung für die Steuererklärung für den Export (Druckseite und CSV).
// Reine Funktionen ohne Prisma.
import { KOSTENGRUPPE_LABEL, type AnlageVAufstellung, type KostenSumme, type Kostengruppe } from "./anlage-v";

export type ExportZeile = { text: string; betrag: number; hinweis?: string; fett?: boolean };

export function aufstellungZeilen(st: AnlageVAufstellung, jahr: number): {
  einnahmen: ExportZeile[];
  kosten: ExportZeile[];
  ueberleitung: ExportZeile[];
} {
  return {
    einnahmen: [
      { text: "Vereinnahmte Mieten (Kaltmiete)", betrag: st.mieten },
      { text: "Vereinnahmte Nebenkosten", betrag: st.nebenkosten, hinweis: "Vorauszahlungen + Nachzahlungen − ausgezahlte Guthaben" },
      { text: "Verrechnete Mietkautionen (Einbehalte)", betrag: st.kautionEinbehalte },
      { text: "Sonstige Einnahmen (Waschgeld, Gebühren)", betrag: st.sonstigeEinnahmen },
      { text: "Summe der Einnahmen", betrag: st.summeEinnahmen, fett: true },
    ],
    kosten: [
      { text: "Instandhaltung (Reparaturen)", betrag: st.instandhaltung },
      { text: "Umlagefähige Kosten", betrag: st.umlagefaehig },
      { text: "Nicht umlagefähige Kosten", betrag: st.nichtUmlagefaehig },
      { text: "Summe der Kosten", betrag: st.summeKosten, fett: true },
    ],
    ueberleitung: [
      { text: "Ergebnis laut Jahresbericht (nach Zahlungsdatum)", betrag: st.ueberschussBericht },
      { text: `Zuzüglich Dezember-Zahlungen ${jahr - 1} für Januar ${jahr}`, betrag: st.abgrenzungHinzu, hinweis: `${st.anzahlHinzu} Zahlungen, 10-Tage-Regel` },
      { text: `Abzüglich Dezember-Zahlungen ${jahr} für Januar ${jahr + 1}`, betrag: -st.abgrenzungHeraus, hinweis: `${st.anzahlHeraus} Zahlungen, 10-Tage-Regel` },
      { text: "Überschuss vor AfA und Schuldzinsen", betrag: st.ueberschuss, fett: true },
    ],
  };
}

// Für den Steuerberater ohne den internen Zusatz „(über Techem verrechnet)“; gleiche Namen danach
// werden zusammengefasst.
// Die Heizkosten je Haus ("Heizkosten Haus 2-12" …) stehen als eine Position „Heizkosten“.
const exportName = (name: string) =>
  name.replace(/\s*\(über Techem verrechnet\)/gi, "").replace(/^Heizkosten Haus .+$/i, "Heizkosten").trim();

function fuerExport(kosten: KostenSumme[]): KostenSumme[] {
  const nachName = new Map<string, KostenSumme>();
  for (const k of kosten) {
    const name = exportName(k.name);
    const schluessel = `${k.gruppe}|${name}`;
    const vorhanden = nachName.get(schluessel);
    if (vorhanden) vorhanden.summe += k.summe;
    else nachName.set(schluessel, { ...k, name });
  }
  return [...nachName.values()];
}

const GRUPPEN_REIHENFOLGE: Kostengruppe[] = ["INSTANDHALTUNG", "UMLAGEFAEHIG", "NICHT_UMLAGEFAEHIG"];

// Alle Bestandteile der Zeile „Sonstige Einnahmen“ (Summe = st.sonstigeEinnahmen): Gutschriften auf
// Kostenarten (Waschgeld, Mahngebühren …, als positive Einnahme), Zahlungen von Mietern auf
// Gebühren-Forderungen und übrige Buchungen.
export function sonstigeEinnahmenZeilen(st: AnlageVAufstellung, kosten: KostenSumme[]): { text: string; betrag: number }[] {
  const zeilen = fuerExport(kosten)
    .filter((k) => k.gruppe === "EINNAHME" && k.summe !== 0)
    .map((k) => ({ text: k.name, betrag: -k.summe }))
    .sort((a, b) => b.betrag - a.betrag);
  if (st.sonderzahlungen !== 0) zeilen.push({ text: "Gebühren-Zahlungen von Mietern (Sonderforderungen)", betrag: st.sonderzahlungen });
  if (st.uebrigeEinnahmen !== 0) zeilen.push({ text: "Übrige Einnahmen", betrag: st.uebrigeEinnahmen });
  return zeilen;
}

// Kostenarten je Gruppe (nach Betrag absteigend), ohne Kostenarten mit Summe 0.
export function kostenNachGruppe(kosten: KostenSumme[]): { gruppe: Kostengruppe; label: string; summe: number; arten: KostenSumme[] }[] {
  const exportKosten = fuerExport(kosten);
  return GRUPPEN_REIHENFOLGE.map((gruppe) => {
    const arten = exportKosten.filter((k) => k.gruppe === gruppe && k.summe !== 0).sort((a, b) => b.summe - a.summe);
    return { gruppe, label: KOSTENGRUPPE_LABEL[gruppe], summe: arten.reduce((s, k) => s + k.summe, 0), arten };
  }).filter((g) => g.arten.length > 0);
}

const csvZahl = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
const csvText = (t: string) => (/[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

// CSV im Format der übrigen Berichte: Semikolon, Dezimalkomma ohne Tausenderpunkt, UTF-8 mit BOM.
export function aufstellungAlsCsv(
  st: AnlageVAufstellung,
  kosten: KostenSumme[],
  jahr: number,
  objekt: string,
): string {
  const z = aufstellungZeilen(st, jahr);
  const zeilen: string[][] = [["Abschnitt", "Bezeichnung", "Betrag"]];
  const block = (abschnitt: string, liste: ExportZeile[]) => {
    for (const e of liste) zeilen.push([abschnitt, e.text, csvZahl(e.betrag)]);
  };
  block("Einnahmen", z.einnahmen);
  block("Kosten", z.kosten);
  block("Überleitung", z.ueberleitung);
  for (const g of kostenNachGruppe(kosten)) {
    for (const a of g.arten) zeilen.push([`Kostenarten – ${g.label}`, a.name, csvZahl(a.summe)]);
  }
  for (const e of sonstigeEinnahmenZeilen(st, kosten)) zeilen.push(["Sonstige Einnahmen", e.text, csvZahl(e.betrag)]);
  zeilen.push(["Hinweis", `Aufstellung ${jahr} ${objekt}: ohne AfA und Schuldzinsen; Mietzahlungen nach Zuflussprinzip inkl. 10-Tage-Regel (22.12.–31.12. für Januar); Kosten nach Abbuchungsdatum`, ""]);
  return "﻿" + zeilen.map((r) => r.map(csvText).join(";")).join("\r\n") + "\r\n";
}
