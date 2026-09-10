import {
  findeKontoauszugSpalten,
  istEigentuemerBuchung,
  istKautionskontoIban,
  KAUTION_ANLAGE_PATTERN,
  KAUTION_PATTERN,
  KLEINREPARATUR_PATTERN,
  leseBetrag,
  NEBENKOSTENAUSGLEICH_PATTERN,
  normalizeText,
  parseGermanDate,
  repariereMojibake,
  RUECKBUCHUNG_PATTERN,
  textEnthaeltWort,
} from "./bank-csv";

// Entspricht den Enum-Werten von KautionBuchungKategorie (siehe schema.prisma), bewusst als
// eigene String-Union statt Import aus dem generierten Prisma-Client: dieses Modul wird auch von
// einer Client-Komponente importiert (page.tsx), ein Prisma-Import dort wäre unnötiges Gewicht.
// EINZAHLUNG_MIETER ist nur noch der Rückfall-Vorschlag für eine eingehende Buchung ohne
// Kautionskonto-IBAN-Treffer (siehe istKautionskontoIban) — mit Treffer wird stattdessen
// AUFLOESUNG vorgeschlagen.
export type KautionKategorieVorschlag = "EINZAHLUNG_MIETER" | "ANLAGE" | "AUFLOESUNG" | "AUSZAHLUNG_MIETER";

export type MietvertragKandidat = {
  id: string;
  label: string;
  warmmiete: number;
  // Vor- und Nachname pro Mieter getrennt (nicht als flache Liste) — die Erkennung unten braucht
  // die Zuordnung, welcher Vorname zu welchem Nachnamen gehört, siehe findeMietvertrag.
  mieterNamen: { vorname: string; nachname: string }[];
  einheitBezeichnung: string;
  beginn: string | null; // ISO yyyy-mm-dd, null = unbekannt
  ende: string | null; // ISO yyyy-mm-dd
};

export type ParsedZahlungRow = {
  rowNumber: number;
  datum: string | null; // ISO yyyy-mm-dd
  betrag: number | null;
  verwendungszweck: string;
  name: string;
  vorgeschlagenerMietvertragId: string | null;
  mehrdeutig: boolean;
  ignorieren: boolean; // z.B. ausgehende Buchung
  rueckbuchung: boolean; // Rücklastschrift/Lastschriftwiderspruch: negative Korrektur einer zuvor gutgeschriebenen Miete
  eigentuemerBuchung: boolean; // Buchung von/an die Eigentümerin (Julia Katharina Waller) – keine Miete
  kaution: boolean; // Kautionszahlung/-rückzahlung – keine Miete, auch wenn der Empfänger die Eigentümerin ist (Kautionskonto)
  kautionKategorieVorschlag: KautionKategorieVorschlag | null; // nur gesetzt, wenn kaution === true
  nebenkostenausgleich: boolean; // Rückzahlung/Nachzahlung aus der Nebenkostenabrechnung – keine Miete, gehört gegen eine offene NebenkostenabrechnungPosition abgeglichen
  kleinreparatur: boolean; // Erstattung einer vom Mieter zu tragenden Kleinreparatur – keine Miete, gehört als Gutschrift in den Kosten-Import (siehe kosten-import.ts)
  rohdaten: Record<string, string>; // die vollständige Originalzeile aus der Datei (alle Spalten)
  errors: string[];
};

const TAGE_TOLERANZ_VOR_BEGINN = 14;
const TAGE_TOLERANZ_NACH_ENDE = 60;

/** Prüft, ob eine Zahlung (mit etwas Toleranz für Kaution/Rücklastschriften) in den Mietzeitraum fällt. */
function liegtImMietzeitraum(datum: string | null, k: MietvertragKandidat): boolean {
  if (!datum) return true;
  const zahlungMs = new Date(datum).getTime();
  if (k.beginn) {
    const beginnMs = new Date(k.beginn).getTime() - TAGE_TOLERANZ_VOR_BEGINN * 86400000;
    if (zahlungMs < beginnMs) return false;
  }
  if (k.ende) {
    const endeMs = new Date(k.ende).getTime() + TAGE_TOLERANZ_NACH_ENDE * 86400000;
    if (zahlungMs > endeMs) return false;
  }
  return true;
}

function findeMietvertrag(
  verwendungszweck: string,
  name: string,
  betrag: number | null,
  datum: string | null,
  kandidaten: MietvertragKandidat[],
): { id: string | null; mehrdeutig: boolean } {
  const text = `${verwendungszweck} ${name}`;

  const scored = kandidaten
    .filter((k) => liegtImMietzeitraum(datum, k))
    .map((k) => {
      let score = 0;
      if (betrag !== null) {
        const differenz = Math.abs(betrag - k.warmmiete);
        if (differenz < 0.01) {
          score += 3;
        } else {
          // Kein exakter Treffer, aber der Betrag liegt deutlich näher an dieser Einheit als
          // eine komplett andere Miethöhe wäre — hilft z.B., wenn dieselbe Person Wohnung und
          // Garage hat und der (evtl. veraltete) Buchungsbetrag zu keiner der beiden exakt
          // passt: er ist trotzdem eindeutig näher an der günstigeren Garage als an der Wohnung.
          const relativeDifferenz = differenz / Math.max(k.warmmiete, betrag, 1);
          if (relativeDifferenz < 0.5) score += 1;
        }
      }
      let getroffeneNamensteile = 0;
      for (const { vorname, nachname } of k.mieterNamen) {
        // Vor- und Nachname je einzeln wortweise prüfen (nicht als ein zusammenhängender String):
        // manche "Mieter" sind eigentlich Firmen/Institutionen, deren voller Name komplett im
        // vorname-Feld steckt (z.B. "Wankendorfer Baugenossenschaft für Schleswig-Holstein") —
        // ein Treffer pro einzelnem, hinreichend langem Wort statt ein Alles-oder-nichts-Treffer
        // auf die gesamte Phrase.
        const vornameWorte = vorname.split(/\s+/).filter((t) => t.length >= 3);
        const nachnameWorte = nachname.split(/\s+/).filter((t) => t.length >= 3);
        // Nachnamen sind unter den Mietern (und erst recht unter fremden Zahlungspartnern, deren
        // Verwendungszweck zufällig einen Vornamen enthält, z.B. "... und Thomas") deutlich
        // seltener/eindeutiger als Vornamen — ein Nachname-Wort-Treffer zählt daher wie bisher
        // voll, ein Vorname-Wort-Treffer dagegen nur schwach: er reicht allein nie für einen
        // Vorschlag, sondern nur zusammen mit einem zweiten Treffer (Nachname, weiteres
        // Vorname-Wort einer mehrteiligen Firmenbezeichnung, oder ein passender Betrag).
        for (const teil of nachnameWorte) {
          if (textEnthaeltWort(text, teil)) {
            score += teil.length >= 4 ? 3 : 1;
            getroffeneNamensteile++;
          }
        }
        for (const teil of vornameWorte) {
          if (textEnthaeltWort(text, teil)) {
            score += 1;
            getroffeneNamensteile++;
          }
        }
      }
      // Mehrere unabhängig getroffene Namensteile (voller Vor+Nachname, oder mehrere Wörter einer
      // Firmenbezeichnung) sind ein deutlich stärkeres, spezifischeres Signal als ein einzelner
      // (evtl. mehrdeutiger, z.B. gängiger Vorname) Namensteil kombiniert mit einer zufällig
      // übereinstimmenden Miethöhe, die sich mehrere Mieter teilen können.
      if (getroffeneNamensteile >= 2) score += 3;
      if (textEnthaeltWort(text, k.einheitBezeichnung.replace(/^HS \d+ WHG \d+ - /, ""))) {
        score += 1;
      }
      return { id: k.id, score };
    });

  const maxScore = Math.max(0, ...scored.map((s) => s.score));
  if (maxScore < 3) return { id: null, mehrdeutig: false };

  const beste = scored.filter((s) => s.score === maxScore);
  if (beste.length > 1) return { id: null, mehrdeutig: true };

  return { id: beste[0].id, mehrdeutig: false };
}

export function mapZahlungenRows(
  headers: string[],
  rows: Record<string, string>[],
  kandidaten: MietvertragKandidat[],
  // Normalisierte Namen bereits bekannter Kosten-Empfänger (Handwerker, Versorger wie Techem
  // usw.) — siehe Verwendung unten für den Grund.
  bekannteKostenEmpfaenger: ReadonlySet<string> = new Set(),
  // Bereits erfasste "Reparaturen"-Kostenbeträge (auf den Cent gerundet) — als zweites,
  // schwächeres Signal neben KLEINREPARATUR_PATTERN: manche Erstattungen (z.B. eine reine
  // Banküberweisung ohne aussagekräftigen Verwendungszweck) lassen sich nur daran erkennen, dass
  // der Betrag exakt einer bereits gezahlten Handwerkerrechnung entspricht.
  bekannteReparaturBetraege: ReadonlySet<number> = new Set(),
): ParsedZahlungRow[] {
  // Ein Betrags-Zufallstreffer mit einer historischen Reparaturrechnung darf keine echte Miete
  // verdecken (z.B. eine Garagenmiete, die zufällig auf denselben Centbetrag wie eine frühere
  // Handwerkerrechnung kommt) — deshalb nur als Signal zählen, wenn der Betrag zu keiner
  // bekannten Warmmiete passt.
  const bekannteWarmmieten = new Set(
    kandidaten.map((k) => Math.round(k.warmmiete * 100) / 100),
  );
  const { datumCol, betragCol, habenCol, sollCol, zweckCol, nameCol, ibanCol } =
    findeKontoauszugSpalten(headers);

  return rows.map((row, i) => {
    const errors: string[] = [];

    const datum = datumCol ? parseGermanDate(row[datumCol]) : null;
    if (!datum) errors.push("Datum fehlt oder unlesbar");

    const betrag = leseBetrag(row, { betragCol, habenCol, sollCol });
    if (betrag === null) errors.push("Betrag fehlt oder unlesbar");

    const verwendungszweck = zweckCol ? repariereMojibake((row[zweckCol] ?? "").trim()) : "";
    const name = nameCol ? repariereMojibake((row[nameCol] ?? "").trim()) : "";
    const iban = ibanCol ? (row[ibanCol] ?? "").trim() : "";

    // Rücklastschriften/Lastschriftwidersprüche sind zwar ausgehende Buchungen (negativer
    // Betrag), korrigieren aber eine zuvor gutgeschriebene Miete, die tatsächlich nicht bezahlt
    // wurde — sie müssen als Korrekturbuchung importiert werden, nicht als "ausgehend" ignoriert.
    const rueckbuchung = RUECKBUCHUNG_PATTERN.test(verwendungszweck);
    const kaution = KAUTION_PATTERN.test(verwendungszweck) || KAUTION_PATTERN.test(name);
    // Die Kautionskonto-IBAN ist das zuverlässigste Signal (siehe istKautionskontoIban) — der
    // Text-Treffer "Anlage" bleibt als Rückfall, falls eine CSV-Quelle mal keine IBAN-Spalte
    // liefert. Für Auflösung gibt es keinen Text-Rückfall, ohne IBAN-Treffer bleibt eine
    // eingehende Kaution-Buchung deshalb der Standard-Vorschlag "Einzahlung Mieter".
    const kautionskontoTreffer = istKautionskontoIban(iban);
    const kautionKategorieVorschlag: KautionKategorieVorschlag | null = !kaution
      ? null
      : betrag === null
        ? null
        : betrag < 0
          ? kautionskontoTreffer || KAUTION_ANLAGE_PATTERN.test(verwendungszweck)
            ? "ANLAGE"
            : "AUSZAHLUNG_MIETER"
          : kautionskontoTreffer
            ? "AUFLOESUNG"
            : "EINZAHLUNG_MIETER";
    const nebenkostenausgleich = NEBENKOSTENAUSGLEICH_PATTERN.test(verwendungszweck);
    const gerundeterBetrag = betrag !== null ? Math.round(betrag * 100) / 100 : null;
    const kleinreparatur =
      KLEINREPARATUR_PATTERN.test(verwendungszweck) ||
      (gerundeterBetrag !== null &&
        gerundeterBetrag > 0 &&
        bekannteReparaturBetraege.has(gerundeterBetrag) &&
        !bekannteWarmmieten.has(gerundeterBetrag) &&
        // Zusätzliche Absicherung gegen Betrags-Zufallstreffer: nennt der Verwendungszweck
        // explizit "Miete" (z.B. eine Garagenmiete, deren Summe aus mehreren Teilbeträgen
        // zufällig einer historischen Reparaturrechnung entspricht), sticht dieser klare
        // Text-Hinweis den bloßen Betragstreffer aus.
        !/miete/i.test(verwendungszweck));
    // Ein Kaution-Treffer im Verwendungszweck hat Vorrang vor der Eigentümer-Erkennung: eine
    // Kaution landet oft auf einem Konto, das rechtlich auf die Eigentümerin läuft
    // (Kautionskonto), ist aber keine Mietweiterleitung/Einlage an sie persönlich.
    const eigentuemerBuchung = !kaution && istEigentuemerBuchung(name);
    // Der tatsächliche Begünstigte/Zahlungspflichtige ist ein bereits bekannter Kosten-Empfänger
    // (Versorger, Handwerker usw., siehe kosten-import.ts) — dann ist die Buchung so gut wie nie
    // eine Miete, selbst wenn der freie Verwendungszweck-Text zufällig einen Namensteil eines
    // Mieters enthält (Banken zitieren dort oft den Namen der Kontoinhaberin als Referenz, z.B.
    // "/FOR/Julia Katharina Waller ...", auch wenn die eigentliche Gegenpartei — hier z.B. Techem —
    // jemand ganz anderes ist; "Katharina" kann dabei zufällig mit einem Mieter-Vornamen
    // übereinstimmen). Bewusst am echten Empfänger-Feld geprüft, nicht am Verwendungszweck.
    const istBekannterKostenEmpfaenger = bekannteKostenEmpfaenger.has(normalizeText(name));
    const ignorieren =
      eigentuemerBuchung ||
      kaution ||
      nebenkostenausgleich ||
      kleinreparatur ||
      istBekannterKostenEmpfaenger ||
      (betrag !== null && betrag <= 0 && !rueckbuchung);

    let vorgeschlagenerMietvertragId: string | null = null;
    let mehrdeutig = false;
    // Ein Vorschlag wird für jede Buchung berechnet, die überhaupt einem Mieter gehören könnte —
    // nur eine Eigentümer-Buchung (Mietweiterleitung/Einlage) oder ein bekannter Kosten-Empfänger
    // scheiden grundsätzlich aus. Das deckt neben normalen Mieteingängen auch (eigentlich
    // "ignorierte") Kaution-Zeilen ab (die Kaution-Sektion braucht den Vorschlag) sowie ausgehende
    // Nebenkostenrückzahlungen an Mieter: der Betrag bestätigt den Treffer hier zwar nicht (er
    // entspricht keiner Warmmiete), aber der Name im Verwendungszweck/Begünstigten reicht meist
    // trotzdem für eine eindeutige Zuordnung.
    if (!eigentuemerBuchung && !istBekannterKostenEmpfaenger && betrag !== null && errors.length === 0) {
      const treffer = findeMietvertrag(verwendungszweck, name, betrag, datum, kandidaten);
      vorgeschlagenerMietvertragId = treffer.id;
      mehrdeutig = treffer.mehrdeutig;
    }

    return {
      rowNumber: i + 2,
      datum,
      betrag,
      verwendungszweck,
      name,
      vorgeschlagenerMietvertragId,
      mehrdeutig,
      ignorieren,
      rueckbuchung,
      eigentuemerBuchung,
      kaution,
      kautionKategorieVorschlag,
      nebenkostenausgleich,
      kleinreparatur,
      rohdaten: row,
      errors,
    };
  });
}
