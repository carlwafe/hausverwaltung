import {
  ermittleMandatsrefAusZeile,
  findeKontoauszugSpalten,
  istEigentuemerBuchung,
  KAUTION_PATTERN,
  leseBetrag,
  NEBENKOSTENAUSGLEICH_PATTERN,
  normalizeText,
  parseGermanDate,
  repariereMojibake,
  RUECKBUCHUNG_PATTERN,
} from "./bank-csv";
import { gebaeudeWert, hausWert, kostengruppeWert } from "../gebaeude-gruppen";

export type KostenartKandidat = { id: string; name: string; umlagefaehig: boolean };
export type GebaeudeKandidat = {
  id: string;
  label: string;
  strasse: string;
  hausnummer: string;
  haus: { id: string } | null;
  kostengruppen: { id: string; bezeichnung: string }[];
};

// Eine bereits erfasste Kostenposition, aus der eine Empfänger→Kostenart/Gebäude-Zuordnung
// gelernt wird. gebaeudeAuswahl ist derselbe "gebaeude:<id>"/"haus:<id>"/"kostengruppe:<id>"-Wert
// wie im Auswahl-<select> (siehe gebaeudeAuswahlWert in gebaeude-gruppen.ts), null wenn die
// Position dem ganzen Objekt statt einem einzelnen Gebäude/Haus/einer Kostengruppe zugeordnet war
// (z.B. Bankgebühren) — nicht nur die rohe Gebäude-ID, sonst wären Haus-/Kostengruppen-Zuordnungen
// (z.B. Techem-Sammellastschriften über mehrere Häuser) aus der Historie nicht mehr
// unterscheidbar von "kein Gebäude". verwendungszweck ist die damals gespeicherte
// Buchungsbeschreibung — wird genutzt, um bei mehrdeutigem Empfänger (z.B. Stadtwerke Eutin für
// Wasser, Wasser+Gas und Strom+Wasser) anhand gemeinsamer Wörter zu unterscheiden. mandatsref ist
// die damals ermittelte SEPA-Mandatsreferenz (aus einer eigenen CSV-Spalte oder aus dem
// Verwendungszweck-Text extrahiert, siehe ermittleMandatsrefAusZeile) — bei manchen Absendern
// (z.B. Stadtwerke Luebeck Energie, die unter demselben Namen sowohl Strom als auch Gas
// abrechnen) unterscheidet sich der Verwendungszweck-Text zwischen den Kostenarten gar nicht,
// wohl aber die je Zählpunkt/Vertrag stabile Mandatsreferenz.
export type EmpfaengerHistorie = {
  empfaenger: string;
  kostenartId: string;
  gebaeudeAuswahl: string | null;
  verwendungszweck: string | null;
  mandatsref: string | null;
};

export type ParsedKostenRow = {
  rowNumber: number;
  datum: string | null; // ISO yyyy-mm-dd
  jahr: number | null;
  // Positiv für eine normale (ausgehende) Kostenbuchung, negativ für eine Gutschrift/Erstattung
  // eines bekannten Kosten-Empfängers (z.B. eine Techem-Rückerstattung) — mindert die Kostenart.
  betrag: number | null;
  verwendungszweck: string;
  empfaenger: string;
  vorgeschlageneKostenartId: string | null;
  // Ein Auswahlwert im selben "gebaeude:<id>"/"haus:<id>"-Format wie das Auswahl-<select>
  // (siehe gebaeudeWert/hausWert in gebaeude-gruppen.ts). null bedeutet "sicher kein
  // Gebäude/Haus" (z.B. Bankgebühren, immer objektweit gebucht), undefined bedeutet "nicht
  // ermittelbar" (unbekannter Empfänger oder mehrdeutige Historie) — die Unterscheidung
  // entscheidet, ob eine Buchung als vollständiger Vorschlag gilt.
  vorgeschlageneGebaeudeAuswahl: string | null | undefined;
  eigentuemerBuchung: boolean;
  rueckbuchung: boolean;
  // Eingehende Buchung von einem bereits als Kosten-Empfänger bekannten Absender — vermutlich eine
  // Rückerstattung/Gutschrift, keine Mieteinnahme.
  gutschrift: boolean;
  kaution: boolean; // Kautionszahlung/-rückzahlung – keine Kostenposition, auch wenn der Empfänger die Eigentümerin ist (Kautionskonto)
  nebenkostenausgleich: boolean; // Rückzahlung/Nachzahlung aus der Nebenkostenabrechnung – keine Kostenposition, gehört gegen eine offene NebenkostenabrechnungPosition abgeglichen
  ignorieren: boolean; // Eigentümer-Buchung, Kaution, Nebenkosten-Ausgleich, oder eingehende Buchung von unbekanntem Absender (vermutlich Miete)
  rohdaten: Record<string, string>;
  errors: string[];
};

/**
 * Alle Historie-Einträge, die zu dieser Buchung gehören: normalerweise per (normalisiertem)
 * Empfängernamen abgeglichen. Hat die Buchung keinen Empfänger — z.B. Bankgebühren, die die
 * Sparkasse ohne Namen selbst abbucht ("ZV-Entgelte", "Portokosten") — greift stattdessen ein
 * exakter Verwendungszweck-Abgleich, da solche Buchungen bei jeder Wiederholung wortwörtlich
 * gleich lauten.
 */
function ermittleTreffer(
  empfaenger: string,
  verwendungszweck: string,
  historie: EmpfaengerHistorie[],
): EmpfaengerHistorie[] {
  const normEmpfaenger = normalizeText(empfaenger);
  if (normEmpfaenger) {
    return historie.filter((h) => normalizeText(h.empfaenger) === normEmpfaenger);
  }
  const normZweck = normalizeText(verwendungszweck);
  if (!normZweck) return [];
  return historie.filter(
    (h) => !normalizeText(h.empfaenger) && normalizeText(h.verwendungszweck ?? "") === normZweck,
  );
}

// Wörter ab 3 Zeichen, ohne reine Zahlen (Kundennummern, Daten, Beträge variieren pro Buchung und
// wären ein falsches Signal) und ohne generische Füllwörter — für den Verwendungszweck-Abgleich
// bei mehrdeutigem Empfänger. Die Untergrenze liegt bei 3 statt 4 Zeichen, damit kurze aber
// bedeutungstragende Wörter wie "Gas" nicht verloren gehen. Monatsnamen zählen ebenfalls als
// Füllwörter: jede wiederkehrende Buchung (z.B. eine monatliche Stadtwerke-Abrechnung) nennt
// irgendeinen Monat, der aber nichts über die Art der Kosten aussagt — je nachdem, für welche
// Monate zufällig schon Historie vorliegt, würde er den Wortabgleich sonst willkürlich zugunsten
// der einen oder anderen Kostenart verschieben und so einen echten Gleichstand verdecken oder
// einen erzeugen, der eigentlich keiner ist.
const FUELLWOERTER = new Set([
  "und", "der", "die", "das", "des", "dem", "den", "fur", "mit", "auf", "aus", "bei", "vom", "zum", "zur",
  "jan", "januar", "feb", "februar", "mrz", "marz", "maerz", "apr", "april", "mai", "jun", "juni",
  "jul", "juli", "aug", "august", "sep", "sept", "september", "okt", "oktober", "nov", "november",
  "dez", "dezember",
]);

function signifikanteWoerter(text: string, zusaetzlicheFuellwoerter: ReadonlySet<string> = new Set()): Set<string> {
  const woerter = text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(
      (w) => w.length >= 3 && !/^\d+$/.test(w) && !FUELLWOERTER.has(w) && !zusaetzlicheFuellwoerter.has(w),
    );
  return new Set(woerter);
}

// Objekt- und Straßennamen (z.B. "Eutin", "Breslauer") kommen in praktisch jeder Buchung eines
// ortsgebundenen Absenders wie Stadtwerke oder Sparkasse vor und tragen deshalb kein Signal
// darüber, um welche Art von Kosten es sich handelt — ohne diesen Ausschluss würde allein die
// gemeinsam genannte Adresse eine scheinbare Ähnlichkeit zwischen zwei völlig unterschiedlichen
// Kostenarten erzeugen (z.B. eine fachfremde Verwaltungsbuchung, die nur zufällig "Breslauer
// Straße" nennt, gegen eine Wasser-Abrechnung derselben Straße).
const ORTS_FUELLWOERTER = new Set(["eutin", "neudorf", "neundorf", "strasse", "str"]);

function strassenFuellwoerter(gebaeudeKandidaten: GebaeudeKandidat[]): Set<string> {
  const woerter = new Set(ORTS_FUELLWOERTER);
  for (const g of gebaeudeKandidaten) {
    for (const wort of signifikanteWoerter(stripStrassenwort(g.strasse))) {
      woerter.add(wort);
    }
  }
  return woerter;
}

/**
 * Schlägt eine Kostenart anhand des Empfängers vor, gelernt aus bereits erfassten
 * Kostenpositionen — aber nur, wenn dieser Empfänger bisher *immer* derselben Kostenart
 * zugeordnet wurde. Ein bisher unbekannter Empfänger liefert bewusst keinen Vorschlag — gerade
 * einmalige Reparaturrechnungen sollen manuell geprüft werden, u.a. weil davon abhängt, ob sie
 * umlagefähig sind.
 *
 * Ist der Empfänger allein mehrdeutig (z.B. "Stadtwerke Eutin GmbH" mal für reines Wasser, mal
 * für Wasser+Gas, mal für Strom+Wasser), wird zusätzlich anhand gemeinsamer, aussagekräftiger
 * Wörter im Verwendungszweck eingegrenzt — nur wenn dabei eine Kostenart eindeutig am besten
 * passt (kein Gleichstand), wird sie vorgeschlagen.
 *
 * Eine SEPA-Mandatsreferenz geht dem voraus: Techem & Co. nutzen für dieselbe
 * Gebäude-/Kostengruppen-Zuordnung oft sogar eine eigene, gebäudespezifische Kostenart (z.B.
 * "Heizkosten Haus 2-12" statt nur "Heizkosten") — bei so einem Empfänger wäre die reine
 * Empfänger-Historie über alle Gebäude hinweg zwangsläufig uneinheitlich. Bei manchen Absendern
 * (z.B. Stadtwerke Luebeck Energie, die unter demselben Namen sowohl Strom als auch Gas
 * abrechnen) hilft nicht einmal der Wortabgleich weiter, weil sich die Buchungstexte beider
 * Kostenarten gar nicht unterscheiden — dort ist die Mandatsreferenz (aus einer eigenen
 * CSV-Spalte statt aus Text, siehe ermittleMandatsrefAusZeile) der einzige verlässliche
 * Unterscheidungsschlüssel je Zählpunkt/Vertrag.
 */
function ermittleKostenartVorschlag(
  empfaenger: string,
  verwendungszweck: string,
  historie: EmpfaengerHistorie[],
  gebaeudeKandidaten: GebaeudeKandidat[],
  mandatsref: string | null,
): string | null {
  if (mandatsref) {
    const mandatsrefTreffer = historie.filter((h) => h.mandatsref === mandatsref);
    if (mandatsrefTreffer.length > 0) {
      const mandatsrefKostenartIds = new Set(mandatsrefTreffer.map((t) => t.kostenartId));
      if (mandatsrefKostenartIds.size === 1) return [...mandatsrefKostenartIds][0];
    }
  }

  const treffer = ermittleTreffer(empfaenger, verwendungszweck, historie);
  if (treffer.length === 0) return null;
  const kostenartIds = new Set(treffer.map((t) => t.kostenartId));
  if (kostenartIds.size === 1) return [...kostenartIds][0];

  // Diese Buchung hat selbst eine Mandatsreferenz (aber ohne Treffer oben — sonst wäre die
  // Funktion bereits zurückgekehrt), und der Empfänger hat nachweislich schon einmal
  // Mandatsreferenz-abhängig unterschiedliche Kostenarten gebucht (z.B. Stadtwerke Luebeck
  // Energie: Strom- und Gas-Zählpunkte). Für so einen Empfänger ist der Buchungstext selbst kein
  // verlässliches Signal — Strom- und Gas-Abschläge tragen denselben Textbaustein ("Abschlag ...
  // naechste Abb. ..."), sodass ein Wortabgleich rein zufällig auf die Kostenart trifft, deren
  // Vorlage in der Historie zufällig am ähnlichsten formuliert ist, ohne echten inhaltlichen
  // Zusammenhang. Für einen neuen Zählpunkt/Vertrag ohne bekannte Mandatsreferenz lieber gar
  // nichts vorschlagen (manuelle Prüfung) als auf dieser Grundlage zu raten.
  if (mandatsref && treffer.some((t) => t.mandatsref)) return null;

  // Wörter aus dem Empfänger-Namen selbst (z.B. "Stadtwerke", "Eutin", "GmbH") sind ebenfalls
  // reine Adress-/Absender-Angabe ohne Aussage über die Kostenart — jede Buchung desselben
  // Absenders würde sie sonst als (falsche) Gemeinsamkeit zählen, egal worum es inhaltlich geht.
  const ortsFuellwoerter = new Set([...strassenFuellwoerter(gebaeudeKandidaten), ...signifikanteWoerter(empfaenger)]);
  const aktuelleWoerter = signifikanteWoerter(verwendungszweck, ortsFuellwoerter);
  if (aktuelleWoerter.size === 0) return null;

  // Jaccard-Ähnlichkeit (Schnittmenge / Vereinigungsmenge) statt reiner Schnittmengengröße: eine
  // reine Schnittmengenzählung würde z.B. "Wasser + Gas" immer mindestens genauso gut wie reines
  // "Wasser" bewerten (Obermenge enthält alle Wörter von "Wasser" plus "gas"), selbst wenn die
  // aktuelle Buchung "Gas" gar nicht erwähnt — Jaccard bestraft die zusätzlichen, nicht
  // übereinstimmenden Wörter auf beiden Seiten und trifft dadurch die genauere Kostenart.
  const scoreProKostenart = new Map<string, number>();
  for (const eintrag of treffer) {
    const woerter = signifikanteWoerter(eintrag.verwendungszweck ?? "", ortsFuellwoerter);
    if (woerter.size === 0) continue;
    const schnittmenge = [...aktuelleWoerter].filter((w) => woerter.has(w)).length;
    if (schnittmenge === 0) continue;
    const vereinigung = new Set([...aktuelleWoerter, ...woerter]).size;
    const jaccard = schnittmenge / vereinigung;
    scoreProKostenart.set(eintrag.kostenartId, Math.max(scoreProKostenart.get(eintrag.kostenartId) ?? 0, jaccard));
  }
  if (scoreProKostenart.size === 0) return null;

  const sortiert = [...scoreProKostenart.entries()].sort((a, b) => b[1] - a[1]);
  if (sortiert.length > 1 && sortiert[0][1] === sortiert[1][1]) return null;
  return sortiert[0][0];
}

// Entfernt "Straße"/"Strasse"/"Str." als eigenständiges Wort, damit z.B. "Breslauer Str." (wie in
// den Gebäudestammdaten üblich) und "Breslauer Strasse" (wie Banken/Versorger oft ausschreiben)
// als dieselbe Straße erkannt werden. Nutzt \b statt eines reinen Präfix-Checks, damit z.B.
// "Strelitzer" nicht fälschlich als "Str." + "elitzer" behandelt wird.
function stripStrassenwort(s: string): string {
  return s.replace(/\bstra(?:ss|ß)e\.?\b/gi, " ").replace(/\bstr\.?(?=\s|$)/gi, " ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Zahlbereich = { von: number; bis: number };

function parseHausnummernToken(token: string): Zahlbereich | null {
  const bereich = token.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (bereich) {
    const von = parseInt(bereich[1], 10);
    const bis = parseInt(bereich[2], 10);
    return { von: Math.min(von, bis), bis: Math.max(von, bis) };
  }
  const einzel = token.trim().match(/^(\d+)$/);
  if (einzel) {
    const n = parseInt(einzel[1], 10);
    return { von: n, bis: n };
  }
  return null;
}

/**
 * Findet eine Hausnummer-Liste/-Spanne direkt nach einem Straßennamen im Text (z.B. "Breslauer
 * Str. 11 - 15" oder "Breslauer Str. 2-18,5-15") und zerlegt sie in einzelne Von-Bis-Bereiche.
 * Ein naiver Einzelzahl-Abgleich (wie unten für den Normalfall) würde bei so einer Liste immer
 * nur die allererste Zahl treffen — alle folgenden Zahlen sind durch die vorherige Zahl vom
 * Straßennamen getrennt und daher für die anschließende [^0-9]-Lücke unerreichbar — und so
 * fälschlich genau ein Gebäude vorschlagen, obwohl der Text eigentlich mehrere/alle Adressen
 * meint (z.B. eine objektweite Hausmeister-Rechnung).
 */
function findeHausnummernSpanne(textLeicht: string, strassen: string[]): Zahlbereich[] | null {
  for (const strasse of strassen) {
    // Erlaubt Leerzeichen nur unmittelbar um "-" oder "," herum (z.B. "11 - 15" oder "2-18, 5-15")
    // — ein bloßes Leerzeichen zwischen zwei vollständigen Zahlen (wie vor einer Jahreszahl, z.B.
    // "Breslauer Str. 2-12 2025/2026") beendet die Erfassung, statt die Jahreszahl versehentlich
    // mit in die Spanne zu ziehen.
    const pattern = new RegExp(
      `\\b${escapeRegExp(strasse)}\\b\\s*(\\d+(?:\\s*-\\s*\\d+)?(?:\\s*,\\s*\\d+(?:\\s*-\\s*\\d+)?)*)\\b`,
      "i",
    );
    const treffer = pattern.exec(textLeicht);
    if (!treffer || !/[-,]/.test(treffer[1])) continue;
    const bereiche = treffer[1]
      .split(",")
      .map((t) => parseHausnummernToken(t))
      .filter((b): b is Zahlbereich => b !== null);
    if (bereiche.length > 0) return bereiche;
  }
  return null;
}

/**
 * Schlägt ein Gebäude, Haus oder eine Kostengruppe zunächst anhand des Buchungstexts vor, sonst
 * — als Fallback — anhand der Empfänger-Historie, aber nur wenn dieser Empfänger bisher *immer*
 * demselben Gebäude zugeordnet wurde. Das deckt z.B. eine Objekt-weite Versicherung ab, die
 * konventionell immer unter einem bestimmten Gebäude erfasst wird, obwohl ihr Buchungstext keine
 * Adresse nennt. Lässt sich beides nicht ermitteln (z.B. eine einmalige Handwerkerrechnung ohne
 * Adresshinweis), bleibt bewusst kein Vorschlag.
 *
 * Adresstext-Erkennung im Detail:
 * - Genau eine Hausnummer im Text (z.B. "Breslauer Str. 14") → dieses eine Gebäude.
 * - Eine oder mehrere Von-Bis-Spannen, deren Gesamt-Minimum/-Maximum genau den Mitgliedern
 *   eines Hauses (z.B. "Breslauer Str. 11 - 15" bei Haus 11/13/15) oder einer Kostengruppe (z.B.
 *   "Breslauer Str. 2-6,8-12" oder "2-12" bei einer Kostengruppe, die mehrere Häuser
 *   zusammenfasst, wie Techem-Heizkosten für mehrere Gebäude gemeinsam) entspricht → dieses Haus
 *   bzw. diese Kostengruppe.
 * - Eine Spanne/Liste, deren Gesamt-Minimum/-Maximum zu keinem Haus und keiner Kostengruppe
 *   passt (z.B. "Breslauer Str. 2-18,5-15", das faktisch das ganze Objekt meint) → nicht per
 *   Adresse ermittelbar, fällt auf die Empfänger-Historie zurück statt zu raten.
 */
function ermittleGebaeudeVorschlag(
  text: string,
  empfaenger: string,
  verwendungszweck: string,
  gebaeude: GebaeudeKandidat[],
  historie: EmpfaengerHistorie[],
  mandatsref: string | null,
): string | null | undefined {
  const textLeicht = stripStrassenwort(text).toLowerCase();
  const strassen = [
    ...new Set(gebaeude.map((g) => stripStrassenwort(g.strasse).trim().toLowerCase()).filter(Boolean)),
  ];
  const spanne = findeHausnummernSpanne(textLeicht, strassen);

  if (!spanne) {
    const adressTreffer = gebaeude.filter((g) => {
      const strasseBasis = stripStrassenwort(g.strasse).trim().toLowerCase();
      const hausnummer = g.hausnummer.trim().toLowerCase();
      if (!strasseBasis || !hausnummer) return false;
      const pattern = new RegExp(
        `\\b${escapeRegExp(strasseBasis)}\\b[^0-9]{0,15}\\b${escapeRegExp(hausnummer)}\\b`,
        "i",
      );
      return pattern.test(textLeicht);
    });
    if (adressTreffer.length === 1) return gebaeudeWert(adressTreffer[0].id);
    // Mehrdeutig (mehrere Adressen im Text) — nicht ermittelbar, nicht "sicher kein Gebäude".
    if (adressTreffer.length > 1) return undefined;
  } else {
    const gesamtVon = Math.min(...spanne.map((s) => s.von));
    const gesamtBis = Math.max(...spanne.map((s) => s.bis));
    const passtZuBereich = (mitglieder: GebaeudeKandidat[]): boolean => {
      const nummern = mitglieder.map((g) => parseInt(g.hausnummer, 10)).filter((n) => !Number.isNaN(n));
      if (nummern.length === 0) return false;
      return Math.min(...nummern) === gesamtVon && Math.max(...nummern) === gesamtBis;
    };

    const hausGruppen = new Map<string, GebaeudeKandidat[]>();
    const kostengruppenGruppen = new Map<string, GebaeudeKandidat[]>();
    for (const g of gebaeude) {
      if (g.haus) {
        const liste = hausGruppen.get(g.haus.id) ?? [];
        liste.push(g);
        hausGruppen.set(g.haus.id, liste);
      }
      for (const kg of g.kostengruppen) {
        const liste = kostengruppenGruppen.get(kg.id) ?? [];
        liste.push(g);
        kostengruppenGruppen.set(kg.id, liste);
      }
    }
    for (const [hausId, mitglieder] of hausGruppen) {
      if (passtZuBereich(mitglieder)) return hausWert(hausId);
    }
    for (const [kostengruppeId, mitglieder] of kostengruppenGruppen) {
      if (passtZuBereich(mitglieder)) return kostengruppeWert(kostengruppeId);
    }
  }
  // Spanne erkannt, aber passt zu keinem einzelnen Haus/keiner Kostengruppe (z.B. mehrteilige
  // Liste, die faktisch das ganze Objekt meint) — auf Mandatsreferenz/Empfänger-Historie
  // zurückfallen statt zu raten.

  // Mandatsreferenz vor der reinen Empfänger-Historie geprüft: derselbe Empfänger (z.B. Techem)
  // bucht oft für mehrere verschiedene Gebäude/Kostengruppen ab, sodass die reine
  // Empfänger-Historie zwangsläufig uneinheitlich und damit unbrauchbar wäre — die
  // Mandatsreferenz grenzt dagegen auf genau die Buchungen ein, die zur selben
  // Gebäude-/Kostengruppen-Zuordnung gehören.
  if (mandatsref) {
    const mandatsrefTreffer = historie.filter((h) => h.mandatsref === mandatsref);
    if (mandatsrefTreffer.length > 0) {
      const auswahlWerte = new Set(mandatsrefTreffer.map((t) => t.gebaeudeAuswahl));
      if (auswahlWerte.size === 1) return [...auswahlWerte][0];
    }
  }

  const treffer = ermittleTreffer(empfaenger, verwendungszweck, historie);
  if (treffer.length === 0) return undefined;
  const auswahlWerte = new Set(treffer.map((t) => t.gebaeudeAuswahl));
  // Uneinheitliche Historie (mal dieses, mal jenes Gebäude, oder mal gar keins) — nicht
  // ermittelbar. Ist die Historie dagegen konsistent (auch konsistent "kein Gebäude" = null),
  // gilt das als sicher bestimmt.
  if (auswahlWerte.size !== 1) return undefined;
  return [...auswahlWerte][0];
}

export function mapKostenRows(
  headers: string[],
  rows: Record<string, string>[],
  historie: EmpfaengerHistorie[],
  gebaeudeKandidaten: GebaeudeKandidat[],
): ParsedKostenRow[] {
  const { datumCol, betragCol, habenCol, sollCol, zweckCol, nameCol, mandatsrefCol } =
    findeKontoauszugSpalten(headers);

  return rows.map((row, i) => {
    const errors: string[] = [];

    const datum = datumCol ? parseGermanDate(row[datumCol]) : null;
    if (!datum) errors.push("Datum fehlt oder unlesbar");

    const rohBetrag = leseBetrag(row, { betragCol, habenCol, sollCol });
    if (rohBetrag === null) errors.push("Betrag fehlt oder unlesbar");

    const verwendungszweck = zweckCol ? repariereMojibake((row[zweckCol] ?? "").trim()) : "";
    const empfaenger = nameCol ? repariereMojibake((row[nameCol] ?? "").trim()) : "";
    const mandatsref = ermittleMandatsrefAusZeile(row, mandatsrefCol, verwendungszweck);

    const rueckbuchung = RUECKBUCHUNG_PATTERN.test(verwendungszweck);
    const istEingehend = rohBetrag !== null && rohBetrag > 0;
    // Ein Kaution-Treffer hat Vorrang vor der Eigentümer-Erkennung: eine Kaution landet oft auf
    // einem Konto, das rechtlich auf die Eigentümerin läuft (Kautionskonto), ist aber weder eine
    // Mietweiterleitung/Einlage an sie persönlich noch eine normale Kosten-Gutschrift.
    const kaution = istEingehend && (KAUTION_PATTERN.test(verwendungszweck) || KAUTION_PATTERN.test(empfaenger));
    // Anders als kaution unabhängig vom Vorzeichen geprüft: eine Nebenkostenabrechnung kann sowohl
    // eine Rückzahlung (ausgehend, Guthaben) als auch eine Nachzahlung (eingehend) sein.
    const nebenkostenausgleich = NEBENKOSTENAUSGLEICH_PATTERN.test(verwendungszweck);
    const eigentuemerBuchung = !kaution && istEigentuemerBuchung(empfaenger);
    // Eine eingehende Buchung ist meistens eine Mieteinnahme (gehört in den Zahlungen-Import) —
    // außer der Absender ist bereits als Kosten-Empfänger bekannt (hat Historie), dann handelt es
    // sich vermutlich um eine Rückerstattung/Gutschrift (z.B. Techem erstattet eine Überzahlung)
    // und mindert die betroffene Kostenart, statt komplett zu verschwinden.
    const bekannterKostenEmpfaenger = ermittleTreffer(empfaenger, verwendungszweck, historie).length > 0;
    const gutschrift = istEingehend && !kaution && !nebenkostenausgleich && bekannterKostenEmpfaenger;
    const ignorieren =
      eigentuemerBuchung ||
      kaution ||
      nebenkostenausgleich ||
      (istEingehend && !kaution && !nebenkostenausgleich && !bekannterKostenEmpfaenger);

    const betrag = rohBetrag !== null ? -rohBetrag : null;
    const jahr = datum ? Number(datum.slice(0, 4)) : null;

    let vorgeschlageneKostenartId: string | null = null;
    let vorgeschlageneGebaeudeAuswahl: string | null | undefined;
    if (!ignorieren && errors.length === 0) {
      vorgeschlageneKostenartId = ermittleKostenartVorschlag(
        empfaenger,
        verwendungszweck,
        historie,
        gebaeudeKandidaten,
        mandatsref,
      );
      vorgeschlageneGebaeudeAuswahl = ermittleGebaeudeVorschlag(
        `${verwendungszweck} ${empfaenger}`,
        empfaenger,
        verwendungszweck,
        gebaeudeKandidaten,
        historie,
        mandatsref,
      );
    }

    return {
      rowNumber: i + 2,
      datum,
      jahr,
      betrag,
      verwendungszweck,
      empfaenger,
      vorgeschlageneKostenartId,
      vorgeschlageneGebaeudeAuswahl,
      eigentuemerBuchung,
      rueckbuchung,
      gutschrift,
      kaution,
      nebenkostenausgleich,
      ignorieren,
      rohdaten: row,
      errors,
    };
  });
}
