// Regelbasierte Erkennung hochgeladener Dokumente (erste Stufe vor der KI-Prüfung): Sie liest die Textebene eines PDFs
// lokal aus (nichts verlässt den Server) und sucht per Mustern Typ, Rechnungsnummer, Datum, Gesamtbetrag, IBAN,
// Aussteller und Objekt. Ergebnis ist nur dann „erkannt“, wenn alles eindeutig ist — jede Mehrdeutigkeit (zwei
// verschiedene Gesamtbeträge, mehrere Rechnungsnummern = vermutlich Sammel-PDF, Netto + MwSt ≠ Brutto) macht das
// Dokument „unsicher“, und die KI-Prüfung (dokument-erkennung.ts) übernimmt auf Knopfdruck. Lieber einmal zu oft die KI
// als einmal ein falsch gelesener Betrag. Reine Funktionen ohne Prisma — gut mit tsx testbar.
import { normalizeText } from "@/lib/import/bank-csv";
import { istGueltigeIban, type Erkennung } from "@/lib/dokument-erkennung";

export type RegelKontext = {
  kostenarten: { id: string; name: string }[];
  /** Dienstleister mit Suchbegriffen (einer pro Zeile) und den ihnen zugeordneten Kostenarten. */
  dienstleister: { name: string; suchbegriffe: string; kostenartIds: string[] }[];
  /** Straßennamen der Gebäude (für die Objektangabe ohne Beschriftung). */
  strassen: string[];
};

export type RegelErgebnis =
  | { status: "erkannt"; erkennung: Erkennung }
  /** Text vorhanden, aber nicht eindeutig: Das Dokument bleibt „nicht erkannt“, `teilweise` dient nur der Anzeige. */
  | { status: "unsicher"; grund: string; teilweise: Partial<Erkennung> }
  /** Kein auslesbarer Text (Scan/Bild): Regeln können nichts tun. */
  | { status: "kein_text"; grund: string };

/** Ab so vielen Zeichen Text gilt ein PDF als lesbar; darunter ist es vermutlich ein Scan ohne Textebene. */
const MIN_ZEICHEN = 60;
const MAX_SEITEN = 40;

const KOSTENTYPEN = ["RECHNUNG", "BESCHEID", "ABRECHNUNG", "ANGEBOT"] as const;

// ---- Hilfsfunktionen ----

const MONATE: Record<string, number> = {
  januar: 1, jänner: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8,
  september: 9, oktober: 10, november: 11, dezember: 12,
};

function iso(j: number, m: number, t: number): string | null {
  if (j < 1990 || j > 2100 || m < 1 || m > 12 || t < 1 || t > 31) return null;
  const s = `${j}-${String(m).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Alle Datumsangaben einer Zeile (TT.MM.JJJJ, TT.MM.JJ, „5. September 2026“) als ISO-Datum. */
export function datenInZeile(zeile: string): string[] {
  const out: string[] = [];
  for (const m of zeile.matchAll(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/g)) {
    const jahr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = iso(jahr, Number(m[2]), Number(m[1]));
    if (d) out.push(d);
  }
  for (const m of zeile.matchAll(/\b(\d{1,2})\.\s?([A-Za-zäöüÄÖÜ]{3,9})\s+(\d{4})\b/g)) {
    const mon = MONATE[m[2].toLowerCase()];
    const d = mon ? iso(Number(m[3]), mon, Number(m[1])) : null;
    if (d) out.push(d);
  }
  return out;
}

const BETRAG = /(-?\s?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})(?!\d)/g;

/** Beträge einer Zeile in der Reihenfolge ihres Auftretens (deutsche Schreibweise, 1.234,56). */
export function betraegeInZeile(zeile: string): number[] {
  const out: number[] = [];
  for (const m of zeile.matchAll(BETRAG)) {
    // Teil eines Datums/einer längeren Zahl ausschließen (z.B. „12,50“ in „12,50,00“ ist nicht gemeint).
    const n = Number(m[1].replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function zeilenVon(seiten: string[]): string[][] {
  return seiten.map((s) => s.split("\n").map((z) => z.replace(/\s+/g, " ").trim()).filter((z) => z.length > 0));
}

function istDatumsText(t: string): boolean {
  return /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(t);
}

// ---- Typ ----

type Typ = Erkennung["typ"];

// Titelzeilen (kurze Zeilen am Anfang der ersten Seite) bestimmen den Typ — ein Wort wie „Angebot“ mitten im
// Fließtext einer Rechnung zählt nicht.
const TITEL_REGELN: { typ: NonNullable<Typ>; muster: RegExp }[] = [
  { typ: "RECHNUNG", muster: /^(?:(?:schluss|abschlags|teil|zwischen|nachtrags|sammel|jahres|strom|gas|wasser|wartungs)-?\s?)?(?:rechnung|gutschrift|stornorechnung)\b/i },
  { typ: "ANGEBOT", muster: /^(?:angebot|kostenvoranschlag|kostenschätzung|kostenschaetzung)\b/i },
  { typ: "BESCHEID", muster: /bescheid\b/i },
  { typ: "ABRECHNUNG", muster: /\b(?:jahres|verbrauchs|heizkosten|betriebskosten|nebenkosten|wasser|strom|gas)?-?abrechnung\b/i },
  { typ: "PROTOKOLL", muster: /(?:übergabe|uebergabe|abnahme|begehungs|wohnungsübergabe)-?protokoll|^protokoll\b/i },
  { typ: "VERTRAG", muster: /^(?:wohnraum)?(?:miet|dienstleistungs|wartungs|werk|pacht)?vertrag\b|\bmietvertrag\b/i },
  { typ: "VERSICHERUNG", muster: /versicherungsschein|versicherungspolice|\bpolice\b|nachtrag zum versicherungs/i },
  { typ: "PRUEFBERICHT", muster: /prüfbericht|pruefbericht|prüfprotokoll|gutachten|energieausweis|wartungsnachweis/i },
  { typ: "BEHOERDE", muster: /finanzamt|grundsteuermessbescheid|einkommensteuerbescheid|grundbuchamt|bauamt/i },
];

const TYP_NAME: Record<string, string> = {
  RECHNUNG: "Rechnung", BESCHEID: "Bescheid", ABRECHNUNG: "Abrechnung", ANGEBOT: "Angebot", PROTOKOLL: "Protokoll",
  VERTRAG: "Vertrag", VERSICHERUNG: "Versicherung", PRUEFBERICHT: "Prüfbericht", BEHOERDE: "Behörde",
};

function bestimmeTyp(erste: string[]): { typ: NonNullable<Typ> | null; mehrdeutig: string | null; titelzeile: string | null } {
  const treffer = new Map<NonNullable<Typ>, string>();
  // Titelzeilen: kurz (≤ 70 Zeichen), in den ersten 25 Zeilen, ohne Doppelpunkt-Beschriftung („Rechnungsdatum: …“).
  for (const z of erste.slice(0, 25)) {
    // Ein Titel ist kurz, beginnt groß und ist kein Satz („…kündige ich den Mietvertrag zum 31.12.2026.“).
    if (z.length > 70 || !/^[A-ZÄÖÜ0-9]/.test(z) || /[.,;]$/.test(z)) continue;
    if (/^[\wäöüÄÖÜß .-]{2,30}:\s*\S/.test(z) && !/bescheid|abrechnung/i.test(z.split(":")[0])) continue;
    for (const r of TITEL_REGELN) {
      if (r.muster.test(z) && !treffer.has(r.typ)) treffer.set(r.typ, z);
    }
  }
  // „Rechnung“ im Titel einer Abrechnung/eines Bescheids („Abrechnung …“ enthält rechnung nicht als Wortanfang) ist
  // dank \b ausgeschlossen. Mehrere Typen in den Titelzeilen (z.B. Rechnung + Abrechnung) → nicht eindeutig.
  if (treffer.size === 0) {
    // Ohne Titelzeile: Rechnungs-Beschriftungen („Rechnungsnummer“, „Rechnungsdatum“) reichen für RECHNUNG.
    const text = erste.join("\n");
    if (/rechnungs?-?(?:nummer|nr\b|datum)/i.test(text)) return { typ: "RECHNUNG", mehrdeutig: null, titelzeile: null };
    return { typ: null, mehrdeutig: null, titelzeile: null };
  }
  if (treffer.size > 1) {
    return { typ: null, mehrdeutig: `Titel nennt mehrere Typen (${[...treffer.keys()].map((t) => TYP_NAME[t]).join(", ")})`, titelzeile: null };
  }
  const [typ, zeile] = [...treffer.entries()][0];
  return { typ, mehrdeutig: null, titelzeile: zeile };
}

// ---- Tabellenkopf („Rechnungs-Nr. Datum Kunden-Nr.“ mit den Werten in der Zeile darunter) ----

const KOPF_LABEL =
  /rechnungs?-?\s?(?:nummer|nr\b\.?)|rechnungs-?datum|beleg-?datum|bescheid-?datum|datum|kunden-?\s?(?:nummer|nr\b\.?)|auftrags-?\s?(?:nummer|nr\b\.?)|bestell-?\s?(?:nummer|nr\b\.?)|liefer-?datum|fälligkeit|zahlungsziel|seite|steuer-?\s?(?:nummer|nr\b\.?)|projekt-?\s?(?:nummer|nr\b\.?)|ihr zeichen|unser zeichen/gi;

/**
 * Ist eine Zeile ein reiner Tabellenkopf aus bekannten Beschriftungen, liefert die nächste Zeile die Werte — aber nur,
 * wenn sie genau so viele durch Leerzeichen getrennte Werte hat wie der Kopf Spalten (sonst unklar, dann kein Treffer).
 */
function kopfWerte(seite: string[]): { label: string; wert: string }[] {
  const out: { label: string; wert: string }[] = [];
  for (let i = 0; i + 1 < seite.length; i++) {
    const labels = [...seite[i].matchAll(KOPF_LABEL)].map((m) => m[0].toLowerCase().replace(/[\s.-]/g, ""));
    if (labels.length < 2) continue;
    if (seite[i].replace(KOPF_LABEL, "").replace(/[\s:.|/-]/g, "").length > 0) continue;
    const werte = seite[i + 1].split(" ");
    if (werte.length !== labels.length) continue;
    labels.forEach((label, j) => out.push({ label, wert: werte[j] }));
  }
  return out;
}

// ---- Rechnungsnummer ----

const NUMMER_LABEL = /(?:rechnungs?-?\s?(?:nummer|nr\b\.?)|rechnung\s+nr\b\.?|re-?\s?nr\b\.?|beleg-?\s?(?:nummer|nr\b\.?)|bescheid-?\s?(?:nummer|nr\b\.?)|angebots?-?\s?(?:nummer|nr\b\.?)|buchungszeichen|kassenzeichen|dokument-?nr\b\.?)\s*[:.#]?\s*/gi;

function nummerKandidat(rest: string): string | null {
  const m = rest.match(/^([A-Za-z]{0,5}[-/ ]?\d[A-Za-z0-9\-/._]{1,24})/);
  if (!m) return null;
  const t = m[1].replace(/[.,;:]+$/, "").replace(/\s+/g, "");
  if (istDatumsText(t) || !/\d/.test(t) || t.length < 3) return null;
  return t;
}

function findeNummern(zeilen: string[][]): string[] {
  const out = new Set<string>();
  for (const seite of zeilen) {
    for (let i = 0; i < seite.length; i++) {
      const z = seite[i];
      NUMMER_LABEL.lastIndex = 0;
      for (const m of z.matchAll(NUMMER_LABEL)) {
        const rest = z.slice((m.index ?? 0) + m[0].length);
        const n = nummerKandidat(rest);
        if (n) out.add(n);
      }
      // Titelzeile „Rechnung 7481“ bzw. „Rechnung Nr. 7481“.
      const t = z.match(/^(?:schluss-?|abschlags-?|teil-?)?rechnung\s+(?:nr\b\.?\s*)?(\d[\w\-/.]{2,24})\s*$/i);
      if (t && !istDatumsText(t[1])) out.add(t[1].replace(/[.,;:]+$/, ""));
    }
    for (const k of kopfWerte(seite)) {
      if (!/^(?:rechnung|beleg|bescheid)s?(?:nummer|nr)$/.test(k.label)) continue;
      const n = nummerKandidat(k.wert);
      if (n) out.add(n);
    }
  }
  return [...out];
}

// ---- Beträge ----

const BETRAG_LABEL =
  /(?:gesamt-?(?:betrag|summe|preis)|rechnungs-?(?:betrag|summe)|end-?(?:betrag|summe)|zahl(?:ungs)?-?betrag|zu zahlen(?:der)?(?: betrag)?|brutto-?(?:betrag|summe|preis)?|summe brutto|betrag brutto|gesamt brutto|fälliger betrag|faelliger betrag|offener betrag|zahlbar)/i;
const BETRAG_AUSSCHLUSS = /netto|zwischensumme|abzgl|abzüglich|anzahlung|bereits (?:gezahlt|beglichen)|skonto|bisher|vorauszahlung|abschlag(?:s)?zahlung|teilzahlung/i;

function findeBetraege(zeilen: string[][]): number[] {
  const out = new Set<number>();
  for (const seite of zeilen) {
    for (let i = 0; i < seite.length; i++) {
      const z = seite[i];
      if (!BETRAG_LABEL.test(z)) continue;
      // „Gesamtbetrag netto“ ist ein Nettobetrag, „zzgl. 19 % MwSt“ eine Steuerzeile — beides nie der Zahlbetrag.
      if (BETRAG_AUSSCHLUSS.test(z) && !/brutto/i.test(z)) continue;
      if (/^(?:zzgl\.?|\+)?\s*(?:\d+(?:,\d+)?\s*%\s*)?(?:mwst|mehrwertsteuer|umsatzsteuer|ust)\b/i.test(z)) continue;
      let betraege = betraegeInZeile(z.replace(/\d+(?:,\d+)?\s*%/g, ""));
      // Beschriftung und Zahl in getrennten Zeilen (Tabellenlayout): die folgende Zeile, wenn sie nur aus einem Betrag besteht.
      if (betraege.length === 0 && i + 1 < seite.length && /^[-+]?\s?[\d.]+,\d{2}\s*(?:€|eur)?$/i.test(seite[i + 1])) {
        betraege = betraegeInZeile(seite[i + 1]);
      }
      if (betraege.length > 0) out.add(Math.round(betraege[betraege.length - 1] * 100) / 100);
    }
  }
  return [...out];
}

/** Netto- und MwSt-Beträge für die Gegenprobe Brutto = Netto + MwSt (nur wenn je genau ein Wert gefunden wird). */
function nettoUndSteuer(zeilen: string[][]): { netto: number; steuer: number } | null {
  const netto = new Set<number>();
  const steuer = new Set<number>();
  for (const seite of zeilen) {
    for (const z of seite) {
      const ohneProzent = z.replace(/\d+(?:,\d+)?\s*%/g, "");
      if (/netto/i.test(z) && /(?:summe|gesamt|betrag|netto\s*$)/i.test(z)) {
        const b = betraegeInZeile(ohneProzent);
        if (b.length) netto.add(Math.round(b[b.length - 1] * 100) / 100);
      } else if (/^(?:zzgl\.?|\+)?\s*(?:\d+(?:,\d+)?\s*%\s*)?(?:mwst|mehrwertsteuer|umsatzsteuer|ust)\b/i.test(z)) {
        const b = betraegeInZeile(ohneProzent);
        if (b.length) steuer.add(Math.round(b[b.length - 1] * 100) / 100);
      }
    }
  }
  return netto.size === 1 && steuer.size === 1 ? { netto: [...netto][0], steuer: [...steuer][0] } : null;
}

// ---- Datum ----

const DATUM_LABEL = /(?:rechnungs-?datum|beleg-?datum|bescheid-?datum|datum der rechnung|ausstellungsdatum|angebots-?datum|vertrags-?datum|^datum\b)\s*[:.]?\s*/i;
const DATUM_AUSSCHLUSS = /leistung|fällig|faellig|zahlbar|zahlung bis|lieferung|liefer|zeitraum|\bbis\b|\bab\b|\bvom\b.*\bbis\b|gültig|gueltig|stichtag/i;

function findeDatum(zeilen: string[][]): { datum: string | null; mehrdeutig: boolean } {
  const gefunden = new Set<string>();
  for (const seite of zeilen) {
    for (const z of seite) {
      const m = z.match(DATUM_LABEL);
      if (!m) continue;
      const rest = z.slice((m.index ?? 0) + m[0].length);
      const d = datenInZeile(rest)[0];
      if (d) gefunden.add(d);
    }
    for (const k of kopfWerte(seite)) {
      if (!/^(?:rechnungs|beleg|bescheid)?datum$/.test(k.label)) continue;
      const d = datenInZeile(k.wert)[0];
      if (d) gefunden.add(d);
    }
  }
  if (gefunden.size === 1) return { datum: [...gefunden][0], mehrdeutig: false };
  if (gefunden.size > 1) return { datum: null, mehrdeutig: true };
  // Ohne Beschriftung: „Eutin, den 12.10.2026“ oder genau ein einzelnes Datum im Kopf der ersten Seite.
  const kopf = zeilen[0]?.slice(0, 25) ?? [];
  const ortDatum = new Set<string>();
  for (const z of kopf) {
    const m = z.match(/^[A-ZÄÖÜ][\wäöüß-]+,\s*(?:den\s+)?(.+)$/);
    if (m) for (const d of datenInZeile(m[1])) ortDatum.add(d);
  }
  if (ortDatum.size === 1) return { datum: [...ortDatum][0], mehrdeutig: false };
  const frei = new Set<string>();
  for (const z of kopf) {
    if (DATUM_AUSSCHLUSS.test(z)) continue;
    for (const d of datenInZeile(z)) frei.add(d);
  }
  return frei.size === 1 ? { datum: [...frei][0], mehrdeutig: false } : { datum: null, mehrdeutig: frei.size > 1 };
}

function findeLeistungszeitraum(zeilen: string[][]): { von: string | null; bis: string | null } {
  for (const seite of zeilen) {
    for (const z of seite) {
      if (!/(?:leistungs?-?|abrechnungs?-?|liefer-?|veranlagungs-?)?zeitraum|leistung vom|abrechnung vom/i.test(z)) continue;
      const d = datenInZeile(z);
      if (d.length >= 2 && d[0] <= d[1]) return { von: d[0], bis: d[1] };
    }
  }
  return { von: null, bis: null };
}

// ---- IBAN ----

function findeIban(text: string): { iban: string | null; mehrere: boolean } {
  const gueltig = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?)\b/g)) {
    const t = m[1].replace(/\s/g, "");
    if (istGueltigeIban(t)) gueltig.add(t);
  }
  return gueltig.size === 1 ? { iban: [...gueltig][0], mehrere: false } : { iban: null, mehrere: gueltig.size > 1 };
}

// ---- Aussteller, Objekt ----

const RECHTSFORM = /\b(?:GmbH|gGmbH|GbR|e\.\s?K\.|e\.\s?V\.|KG|OHG|AG|UG|mbH|Inh\.|Stadtwerke|Kreis|Stadt|Gemeinde|Amt|Zweckverband)\b/;

function sucheDienstleister(seiten: string[], kontext: RegelKontext): { name: string; kostenartIds: string[] } | null {
  // Den Namen eines Dienstleisters nennt vor allem der Briefkopf (obere Hälfte der ersten Seite) bzw. der Fuß; wir suchen
  // im ganzen Text, bevorzugen aber Treffer im Kopf. Mehrere verschiedene Dienstleister im Kopf → keine Zuordnung.
  const ganz = normalizeText(seiten.join(" "));
  const kopf = normalizeText((seiten[0] ?? "").slice(0, 900));
  const treffer = (text: string) => {
    const t = new Map<string, { name: string; kostenartIds: string[]; laenge: number }>();
    for (const d of kontext.dienstleister) {
      const begriffe = [...d.suchbegriffe.split("\n"), d.name].map((b) => normalizeText(b)).filter((b) => b.length >= 4);
      const best = Math.max(0, ...begriffe.filter((b) => text.includes(b)).map((b) => b.length));
      if (best > 0) t.set(d.name, { name: d.name, kostenartIds: d.kostenartIds, laenge: best });
    }
    return [...t.values()];
  };
  const imKopf = treffer(kopf);
  if (imKopf.length === 1) return imKopf[0];
  if (imKopf.length > 1) return null;
  const imText = treffer(ganz);
  return imText.length === 1 ? imText[0] : null;
}

function sucheAussteller(erste: string[]): string | null {
  for (const z of erste.slice(0, 12)) {
    // Absenderzeile „Firma · Straße · PLZ Ort“ bzw. Briefkopf mit Rechtsform.
    for (const teil of z.split(/\s[·|•]\s|\s[-–]\s(?=\D*\d)/)) {
      const t = teil.trim();
      if (t.length >= 4 && t.length <= 70 && RECHTSFORM.test(t) && !/^\d/.test(t) && !/straße|str\.|weg\b/i.test(t)) return t;
    }
  }
  return null;
}

function sucheObjekt(zeilen: string[][], kontext: RegelKontext): string | null {
  for (const seite of zeilen) {
    for (const z of seite) {
      const m = z.match(/\b(?:objekt|leistungsort|einsatzort|baustelle|bauvorhaben|liegenschaft|grundstück|grundstueck)\s*[:.]\s*(.{3,120})$/i);
      if (m) return m[1].trim();
    }
  }
  // Ohne Beschriftung: bekannte Straße samt Hausnummer(n) — aber nicht aus dem Adressfeld ganz oben (dort steht oft nur
  // die Anschrift des Empfängers).
  const strassen = kontext.strassen.map((s) => s.trim()).filter((s) => s.length >= 4);
  for (const z of (zeilen[0] ?? []).slice(10)) {
    for (const s of strassen) {
      const m = z.match(new RegExp(`${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\d{1,3}[a-z]?(?:\\s?[/,-]\\s?\\d{1,3}[a-z]?)*`, "i"));
      if (m) return m[0];
    }
  }
  return null;
}

function sucheBetreff(zeilen: string[][]): string | null {
  for (const z of zeilen[0] ?? []) {
    const m = z.match(/^(?:betreff|betr\.?)\s*[:.]\s*(.{4,120})$/i);
    if (m) return m[1].trim();
  }
  return null;
}

function sucheKostenjahr(typ: NonNullable<Typ>, titelzeile: string | null, zeitraum: { bis: string | null }, zeilen: string[][]): number | null {
  if (zeitraum.bis) return Number(zeitraum.bis.slice(0, 4));
  if (typ !== "BESCHEID" && typ !== "ABRECHNUNG") return null;
  const aus = (z: string) => z.match(/\b(20\d{2})\b/)?.[1];
  const j = (titelzeile && aus(titelzeile)) || zeilen[0]?.slice(0, 25).map((z) => z.match(/(?:für das (?:jahr|kalenderjahr)|abrechnungsjahr|veranlagungsjahr|jahr)\s*:?\s*(20\d{2})/i)?.[1]).find(Boolean);
  return j ? Number(j) : null;
}

// ---- Hauptfunktion ----

export function erkenneDokumentPerRegeln(seiten: string[], kontext: RegelKontext): RegelErgebnis {
  const gesamt = seiten.join("\n");
  if (gesamt.replace(/\s/g, "").length < MIN_ZEICHEN) {
    return { status: "kein_text", grund: "Das PDF enthält (fast) keinen auslesbaren Text — vermutlich ein Scan." };
  }
  if (seiten.length > MAX_SEITEN) return { status: "unsicher", grund: `Das PDF hat ${seiten.length} Seiten.`, teilweise: {} };

  const zeilen = zeilenVon(seiten);
  const erste = zeilen[0] ?? [];
  const { typ, mehrdeutig, titelzeile } = bestimmeTyp(erste);
  const teilweise: Partial<Erkennung> = { typ };
  if (!typ) return { status: "unsicher", grund: mehrdeutig ?? "Der Dokumenttyp ist nicht eindeutig erkennbar.", teilweise };

  const { datum, mehrdeutig: datumMehrdeutig } = findeDatum(zeilen);
  const iban = findeIban(gesamt);
  const dl = sucheDienstleister(seiten, kontext);
  const aussteller = dl?.name ?? sucheAussteller(erste);
  const objekt = sucheObjekt(zeilen, kontext);
  const betreff = sucheBetreff(zeilen);
  Object.assign(teilweise, { rechnungsdatum: datum, aussteller, objekt, iban: iban.iban });

  // Typen ohne Zahlungsbezug (Vertrag, Protokoll, Versicherung, Prüfbericht, Behörde): Typ und Datum genügen.
  if (!KOSTENTYPEN.includes(typ as (typeof KOSTENTYPEN)[number])) {
    return {
      status: "erkannt",
      erkennung: {
        typ, titel: betreff ?? titelzeile?.slice(0, 120) ?? null, aussteller, rechnungsnummer: null, rechnungsdatum: datum,
        leistungVon: null, leistungBis: null, betrag: null, iban: null, kostenjahr: null, kostenartId: null,
        adressat: null, objekt, konfidenz: datum ? "mittel" : "niedrig",
        hinweis: "Per Regeln erkannt (Titel des Dokuments).",
      },
    };
  }

  // Kostenbelege: alles muss eindeutig sein.
  const nummern = findeNummern(zeilen);
  if (nummern.length > 1) {
    return { status: "unsicher", grund: `Mehrere Rechnungsnummern (${nummern.slice(0, 3).join(", ")}) — vermutlich mehrere Dokumente in einem PDF.`, teilweise };
  }
  teilweise.rechnungsnummer = nummern[0] ?? null;
  const betraege = findeBetraege(zeilen);
  if (betraege.length === 0) return { status: "unsicher", grund: "Kein eindeutiger Gesamtbetrag gefunden.", teilweise };
  if (betraege.length > 1) {
    return { status: "unsicher", grund: `Mehrere mögliche Gesamtbeträge (${betraege.slice(0, 3).map((b) => b.toFixed(2).replace(".", ",")).join("; ")} €).`, teilweise };
  }
  let betrag = betraege[0];
  if (/gutschrift|storno/i.test(titelzeile ?? "") && betrag > 0) betrag = -betrag;
  teilweise.betrag = betrag;
  const probe = nettoUndSteuer(zeilen);
  if (probe && Math.abs(probe.netto + probe.steuer - Math.abs(betrag)) > 0.02) {
    return { status: "unsicher", grund: "Netto + MwSt ergeben nicht den Gesamtbetrag.", teilweise };
  }
  if (typ !== "BESCHEID" && !nummern[0]) return { status: "unsicher", grund: "Keine Rechnungs- bzw. Belegnummer gefunden.", teilweise };
  if (datumMehrdeutig) return { status: "unsicher", grund: "Mehrere mögliche Belegdaten.", teilweise };
  if (!datum) return { status: "unsicher", grund: "Kein Belegdatum gefunden.", teilweise };

  const zeitraum = findeLeistungszeitraum(zeilen);
  const kostenartId = dl && dl.kostenartIds.length === 1 ? dl.kostenartIds[0] : null;
  const vollstaendig = Boolean(aussteller) && Boolean(nummern[0] || typ === "BESCHEID");
  return {
    status: "erkannt",
    erkennung: {
      typ,
      titel: betreff ?? `${TYP_NAME[typ]}${nummern[0] ? ` ${nummern[0]}` : ""}${aussteller ? ` ${aussteller}` : ""}`.slice(0, 120),
      aussteller,
      rechnungsnummer: nummern[0] ?? null,
      rechnungsdatum: datum,
      leistungVon: zeitraum.von,
      leistungBis: zeitraum.bis,
      betrag,
      iban: iban.iban,
      kostenjahr: sucheKostenjahr(typ, titelzeile, zeitraum, zeilen),
      kostenartId,
      adressat: null,
      objekt,
      konfidenz: vollstaendig ? "hoch" : "mittel",
      hinweis: aussteller ? "Per Regeln erkannt." : "Per Regeln erkannt — Aussteller nicht gefunden.",
    },
  };
}
