// Aufbereitung der Aufstellung für die Steuererklärung für den Export (Druckseite und CSV).
// Reine Funktionen ohne Prisma.
import { KOSTENGRUPPE_LABEL, type AnlageVAufstellung, type KostenSumme, type Kostengruppe } from "./anlage-v";
import type { AfaPosition } from "./afa-positionen";

const euroText = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export type ExportZeile = { text: string; betrag: number; hinweis?: string; fett?: boolean; davon?: boolean };

export function aufstellungZeilen(st: AnlageVAufstellung, jahr: number): {
  einnahmen: ExportZeile[];
  kosten: ExportZeile[];
  // Anschaffungs-/Herstellungskosten: nicht in den Kosten, Grundlage der Abschreibung (leer, wenn keine).
  anschaffung: ExportZeile[];
  ueberschuss: ExportZeile[];
  // Hinweise zur 10-Tage-Regel (mit Betrag), ohne Verweis auf den internen Jahresbericht.
  zehnTage: ExportZeile[];
} {
  const einnahmen: ExportZeile[] = [
    {
      text: "Vereinnahmte Mieten (Kaltmiete, netto)",
      betrag: st.mieten,
      hinweis: st.kautionMitMiete !== 0 ? `darin ${euroText(st.kautionMitMiete)} mit Kaution verrechnet` : undefined,
    },
    ...(st.umsatzsteuer !== 0
      ? [{ text: "Vereinnahmte Umsatzsteuer (Garagenmieten)", betrag: st.umsatzsteuer }]
      : []),
    { text: "Vereinnahmte Nebenkosten", betrag: st.nebenkosten, hinweis: "Vorauszahlungen + Nachzahlungen − Erstattungen" },
    { text: "davon Vorauszahlungen", betrag: st.nkVorauszahlungen, davon: true },
    {
      text: "davon Nachzahlungen aus der Abrechnung",
      betrag: st.nkNachzahlungen,
      davon: true,
      hinweis: st.kautionMitNk !== 0 ? `darin ${euroText(st.kautionMitNk)} mit Kaution verrechnet` : undefined,
    },
    { text: "davon Erstattungen (ausgezahlte Guthaben)", betrag: -st.nkGuthaben, davon: true },
    { text: "Sonstige Einnahmen (Waschgeld, Gebühren)", betrag: st.sonstigeEinnahmen },
    { text: "Summe der Einnahmen", betrag: st.summeEinnahmen, fett: true },
  ];
  const zehnTage: ExportZeile[] = [];
  if (st.anzahlHinzu > 0)
    zehnTage.push({
      text: `In den Mieten enthalten: Dezember-Zahlungen ${jahr - 1} für Januar ${jahr}`,
      betrag: st.abgrenzungHinzu,
      hinweis: `${st.anzahlHinzu} Zahlungen`,
    });
  if (st.anzahlHeraus > 0)
    zehnTage.push({
      text: `Nicht enthalten (zählen ${jahr + 1}): Dezember-Zahlungen ${jahr} für Januar ${jahr + 1}`,
      betrag: st.abgrenzungHeraus,
      hinweis: `${st.anzahlHeraus} Zahlungen`,
    });
  return {
    einnahmen,
    kosten: [
      { text: "Instandhaltung (Reparaturen)", betrag: st.instandhaltung },
      { text: "Umlagefähige Kosten", betrag: st.umlagefaehig },
      { text: "Nicht umlagefähige Kosten", betrag: st.nichtUmlagefaehig },
      { text: "Summe der Kosten", betrag: st.summeKosten, fett: true },
    ],
    anschaffung:
      st.anschaffung !== 0
        ? [
            {
              text: "Anschaffungs- und Herstellungskosten (Abschreibung über die Nutzungsdauer)",
              betrag: st.anschaffung,
              hinweis: "nicht in den Kosten und nicht im Überschuss; Einzelposten siehe Anlage",
            },
          ]
        : [],
    ueberschuss: [{ text: "Überschuss vor AfA und Schuldzinsen (Einnahmen − Kosten)", betrag: st.ueberschuss, fett: true }],
    zehnTage,
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

const GRUPPEN_REIHENFOLGE: Kostengruppe[] = ["INSTANDHALTUNG", "UMLAGEFAEHIG", "NICHT_UMLAGEFAEHIG", "ANSCHAFFUNG"];

const datumText = (d: Date | null, jahr: number | null) =>
  d ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : jahr ? `Kostenjahr ${jahr}` : "";

// Einzelposten der Anschaffungs-/Herstellungskosten für die Anlage und die CSV: Datum, Kostenart, Objekt,
// Empfänger und Rechnungstext, damit der Steuerberater die Abschreibung je Anschaffung bestimmen kann.
export function afaEinzelposten(
  positionen: AfaPosition[],
): { datum: string; kostenart: string; objekt: string; beschreibung: string; vermietung: string; betrag: number }[] {
  return positionen.map((p) => ({
    datum: datumText(p.datum, p.jahr),
    kostenart: p.kostenart,
    objekt: p.objekt,
    beschreibung: [p.empfaenger, p.text].filter(Boolean).join(" – "),
    vermietung: p.vermietung,
    betrag: p.betrag,
  }));
}

// Alle Bestandteile der Zeile „Sonstige Einnahmen“ (Summe = st.sonstigeEinnahmen): Gutschriften auf
// Kostenarten (Waschgeld, Mahngebühren …, als positive Einnahme), Zahlungen von Mietern auf
// Gebühren-Forderungen und übrige Buchungen.
export function sonstigeEinnahmenZeilen(st: AnlageVAufstellung, kosten: KostenSumme[]): { text: string; betrag: number }[] {
  const zeilen = fuerExport(kosten)
    .filter((k) => k.gruppe === "EINNAHME" && k.summe !== 0)
    .map((k) => ({ text: k.name, betrag: -k.summe }))
    .sort((a, b) => b.betrag - a.betrag);
  if (st.sonderzahlungen !== 0) zeilen.push({ text: "Gebühren-Zahlungen von Mietern (Sonderforderungen)", betrag: st.sonderzahlungen });
  if (st.kautionPauschal !== 0) zeilen.push({ text: "Pauschale Kautionseinbehalte (Schlüssel, Gebühren)", betrag: st.kautionPauschal });
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
  afaPositionen: AfaPosition[] = [],
): string {
  const z = aufstellungZeilen(st, jahr);
  const zeilen: string[][] = [["Abschnitt", "Bezeichnung", "Betrag"]];
  const block = (abschnitt: string, liste: ExportZeile[]) => {
    // „davon“-Zeilen stehen im eigenen Abschnitt, damit eine Spaltensumme nichts doppelt zählt.
    for (const e of liste) zeilen.push([e.davon ? `${abschnitt} (davon)` : abschnitt, e.hinweis?.startsWith("darin") ? `${e.text} (${e.hinweis})` : e.text, csvZahl(e.betrag)]);
  };
  block("Einnahmen", z.einnahmen);
  block("Kosten", z.kosten);
  block("Anschaffung (AfA)", z.anschaffung);
  block("Überschuss", z.ueberschuss);
  block("10-Tage-Regel", z.zehnTage);
  for (const g of kostenNachGruppe(kosten)) {
    for (const a of g.arten) zeilen.push([`Kostenarten – ${g.label}`, a.name, csvZahl(a.summe)]);
  }
  for (const e of afaEinzelposten(afaPositionen))
    zeilen.push(["Anschaffung (AfA) – Einzelposten", `${e.datum} · ${e.kostenart} · ${e.objekt}${e.vermietung ? ` (${e.vermietung})` : ""} · ${e.beschreibung}`, csvZahl(e.betrag)]);
  for (const e of sonstigeEinnahmenZeilen(st, kosten)) zeilen.push(["Sonstige Einnahmen", e.text, csvZahl(e.betrag)]);
  zeilen.push(["Hinweis", `Aufstellung ${jahr} ${objekt}: ohne AfA und Schuldzinsen${st.anschaffung !== 0 ? " (Anschaffungs-/Herstellungskosten gesondert als Grundlage der AfA, nicht in den Kosten)" : ""}; Mietzahlungen nach Zuflussprinzip inkl. 10-Tage-Regel (22.12.–31.12. für Januar); Kosten nach Abbuchungsdatum`, ""]);
  return "﻿" + zeilen.map((r) => r.map(csvText).join(";")).join("\r\n") + "\r\n";
}
