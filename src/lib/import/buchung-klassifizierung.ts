// Führt die beiden bestehenden, unveränderten Klassifizierer (mapZahlungenRows/mapKostenRows) zu
// EINER Kandidaten-Liste pro Zeile zusammen — Kern der vereinheitlichten Import-Ansicht.
// zahlungen-import.ts/kosten-import.ts/bank-csv.ts selbst bleiben bewusst unangetastet: die
// eigentliche Mustererkennung (Kaution-/Nebenkostenausgleich-Pattern, der Mietvertrags-Score-
// Algorithmus, der Kostenart-/Gebäude-Vorschlag) ist bereits gut abgestimmt und gegen echte
// Daten verifiziert. previewImport ruft beide Klassifizierer schon heute auf demselben
// vollständigen Zeilensatz auf (nicht auf vorgefilterte Teilmengen) — hier werden pro Zeile nur
// die Ergebnisse zusammengeführt.
import type { ParsedZahlungRow } from "./zahlungen-import";
import type { ParsedKostenRow } from "./kosten-import";

// Nur zwei Zustände: "vorschlag" (Buchungsart wurde sicher erkannt, z.B. über ein Muster wie
// Kaution/Nebenkostenausgleich oder einen eindeutigen Mietvertrags-/Kostenart-Treffer) und
// "pruefen" (nur eine Vermutung, nicht sicher). Eine Fehlerzeile hat gar keine Kandidaten
// (errors.length > 0 auf der Zeile selbst zeigt das an).
export type HinweisStatus = "vorschlag" | "pruefen";

export type ZeilenKandidat = { code: string; hinweis: HinweisStatus };

const KAUTION_VORSCHLAG_ZU_CODE: Record<string, string> = {
  EINZAHLUNG_MIETER: "KAUTION_EINZAHLUNG",
  ANLAGE: "KAUTION_ANLAGE",
  AUFLOESUNG: "KAUTION_AUFLOESUNG",
  AUSZAHLUNG_MIETER: "KAUTION_AUSZAHLUNG",
};

export type VereinheitlichteZeile = {
  rowNumber: number;
  datum: string | null;
  betrag: number | null;
  name: string;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
  errors: string[];
  // Ein oder zwei mögliche Buchungsarten für diese Zeile (leer nur bei errors.length > 0).
  // Zwei Kandidaten nur im Fallback-Fall unten (weder Miete noch Kosten sicher) — die Zeile
  // bleibt dann unter BEIDEN Buchungsart-Filtern auffindbar, bis der Nutzer sie einer Seite
  // zuordnet, statt schon vorab in genau eine Richtung gezwungen zu werden.
  kandidaten: ZeilenKandidat[];
  vorgeschlagenerMietvertragId: string | null;
  vorgeschlageneKostenartId: string | null;
  vorgeschlageneGebaeudeAuswahl: string | null | undefined;
};

/**
 * Reine Zusammenführung — bekommt zwei bereits fertig berechnete Klassifizierungen derselben
 * Zeile (gleiche rowNumber) und leitet die Kandidatenliste ab. Priorität (aus den Divergenzen
 * zwischen zahlungen-import.ts und kosten-import.ts bewusst vereinheitlicht):
 *
 * 1. Fehler -> keine Kandidaten
 * 2. Eigentümer-Buchung -> MIETWEITERLEITUNG, sicher (kostenZeile prüft zusätzlich die
 *    Waschgeld-Ausnahme)
 * 3. Kaution -> passende KAUTION_*-Buchungsart, sicher (Betrag+IBAN-basiert, aus zahlungZeile)
 * 4. Nebenkostenausgleich -> NEBENKOSTENAUSGLEICH, sicher
 * 5. Kleinreparatur -> KOSTENPOSITION, sicher (Kostenart bereits von mapKostenRows auf
 *    "Reparaturen" vorbelegt)
 * 6. Rücklastschrift -> MIETZAHLUNG, sicher (negative Korrektur — anders als im bisherigen
 *    Kosten-Import, der Rücklastschriften komplett ignoriert: eine Rücklastschrift ist immer
 *    eine Mietkorrektur, nie eine Kosten-Buchung, das übernimmt bewusst nur die Zahlungen-Seite)
 * 7. Gutschrift (bekannter Kosten-Empfänger, negativer Betrag) -> KOSTENPOSITION, sicher
 * 8. Fallback: weder ein Muster noch eine der obigen Sonderkategorien hat gegriffen. Ist genau
 *    eine Seite sicher (eindeutiger Mietvertrags- bzw. Kostenart+Gebäude-Treffer), gilt nur
 *    diese als Kandidat. Sind BEIDE Seiten sicher (selten), entscheidet das Vorzeichen. Ist
 *    KEINE Seite sicher, bleiben beide Interpretationen als "bitte prüfen"-Kandidat bestehen —
 *    genau wie früher in den getrennten Zahlungen-/Kosten-Sektionen, wo eine solche Zeile in
 *    beiden gleichzeitig als "bitte prüfen" auftauchte.
 */
export function ermittleBuchungsartKandidaten(
  zahlungZeile: ParsedZahlungRow,
  kostenZeile: ParsedKostenRow,
): ZeilenKandidat[] {
  if (zahlungZeile.errors.length > 0 || kostenZeile.errors.length > 0) {
    return [];
  }
  if (kostenZeile.eigentuemerBuchung) {
    return [{ code: "MIETWEITERLEITUNG", hinweis: "vorschlag" }];
  }
  if (zahlungZeile.kaution || kostenZeile.kaution) {
    const code = zahlungZeile.kautionKategorieVorschlag
      ? KAUTION_VORSCHLAG_ZU_CODE[zahlungZeile.kautionKategorieVorschlag]
      : "KAUTION_SONSTIGES";
    return [{ code, hinweis: "vorschlag" }];
  }
  if (zahlungZeile.nebenkostenausgleich || kostenZeile.nebenkostenausgleich) {
    return [{ code: "NEBENKOSTENAUSGLEICH", hinweis: "vorschlag" }];
  }
  if (zahlungZeile.kleinreparatur || kostenZeile.kleinreparatur) {
    return [{ code: "KOSTENPOSITION", hinweis: "vorschlag" }];
  }
  if (zahlungZeile.rueckbuchung) {
    return [{ code: "MIETZAHLUNG", hinweis: "vorschlag" }];
  }
  if (kostenZeile.gutschrift) {
    return [{ code: "KOSTENPOSITION", hinweis: "vorschlag" }];
  }

  const zahlungSicher = Boolean(zahlungZeile.vorgeschlagenerMietvertragId) && !zahlungZeile.mehrdeutig;
  const kostenSicher =
    Boolean(kostenZeile.vorgeschlageneKostenartId) && kostenZeile.vorgeschlageneGebaeudeAuswahl !== undefined;

  if (zahlungSicher && !kostenSicher) {
    return [{ code: "MIETZAHLUNG", hinweis: "vorschlag" }];
  }
  if (kostenSicher && !zahlungSicher) {
    return [{ code: "KOSTENPOSITION", hinweis: "vorschlag" }];
  }
  if (zahlungSicher && kostenSicher) {
    const betrag = zahlungZeile.betrag ?? kostenZeile.betrag;
    const code = betrag !== null && betrag > 0 ? "MIETZAHLUNG" : "KOSTENPOSITION";
    return [{ code, hinweis: "vorschlag" }];
  }

  // Weder Miete noch Kosten sicher — bewusst beide als "bitte prüfen" anbieten, sortiert nach
  // der wahrscheinlicheren Interpretation zuerst (Vorzeichen), damit die Vorbelegung des
  // Buchungsart-Dropdowns sinnvoll bleibt.
  const betrag = zahlungZeile.betrag ?? kostenZeile.betrag;
  const zahlungZuerst = betrag === null || betrag > 0;
  const zahlungKandidat: ZeilenKandidat = { code: "MIETZAHLUNG", hinweis: "pruefen" };
  const kostenKandidat: ZeilenKandidat = { code: "KOSTENPOSITION", hinweis: "pruefen" };
  return zahlungZuerst ? [zahlungKandidat, kostenKandidat] : [kostenKandidat, zahlungKandidat];
}

export type BuchungsartGruppe = "MIETE" | "KOSTEN" | "MIETWEITERLEITUNG" | "KAUTION" | "NEBENKOSTENAUSGLEICH" | "SONDERZAHLUNG";

// Ordnet einen Buchungsart-Katalog-Code seiner Familie zu — entscheidet serverseitig (commitBuchungen)
// über Pflichtfeld-Prüfung/Dedup-Formel und clientseitig (buchungen-tabelle.tsx) über die
// bedingt eingeblendeten Felder. Beide Seiten importieren dieselbe Funktion, damit sie nicht
// auseinanderlaufen können.
export function ermittleBuchungsartGruppe(code: string): BuchungsartGruppe | null {
  if (code === "MIETZAHLUNG") return "MIETE";
  if (code === "KOSTENPOSITION") return "KOSTEN";
  if (code === "MIETWEITERLEITUNG") return "MIETWEITERLEITUNG";
  if (code === "NEBENKOSTENAUSGLEICH") return "NEBENKOSTENAUSGLEICH";
  if (code === "SONDERZAHLUNG") return "SONDERZAHLUNG";
  if (code.startsWith("KAUTION_")) return "KAUTION";
  return null;
}

/** Zippt die beiden Klassifizierungs-Ergebnisse (gleiche rowNumber) zu einer Zeilenliste. */
export function vereinheitlicheZeilen(
  zahlungenRows: ParsedZahlungRow[],
  kostenRows: ParsedKostenRow[],
): VereinheitlichteZeile[] {
  const kostenNachRowNumber = new Map(kostenRows.map((k) => [k.rowNumber, k]));
  return zahlungenRows.map((z) => {
    const k = kostenNachRowNumber.get(z.rowNumber);
    if (!k) throw new Error(`Keine passende Kosten-Zeile für rowNumber ${z.rowNumber} gefunden.`);
    return {
      rowNumber: z.rowNumber,
      datum: z.datum,
      betrag: z.betrag,
      name: z.name,
      verwendungszweck: z.verwendungszweck,
      rohdaten: z.rohdaten,
      errors: [...z.errors, ...k.errors],
      kandidaten: ermittleBuchungsartKandidaten(z, k),
      vorgeschlagenerMietvertragId: z.vorgeschlagenerMietvertragId,
      vorgeschlageneKostenartId: k.vorgeschlageneKostenartId,
      vorgeschlageneGebaeudeAuswahl: k.vorgeschlageneGebaeudeAuswahl,
    };
  });
}
