// Berechnungs-Engine für die Nebenkostenabrechnung. Reine Funktionen auf einfachen Datenstrukturen
// (kein Prisma-Import hier) — die aufrufende Server Action lädt die Daten und übergibt sie, das
// macht die Berechnung isoliert testbar (z.B. per tsx-Skript gegen echte Daten).

export type VerteilerschluesselTyp =
  | "WOHNFLAECHE"
  | "MITEIGENTUMSANTEIL"
  | "PERSONENZAHL"
  | "EINHEITEN"
  | "VERBRAUCH_MANUELL";

// Nur diese beiden sind aktuell tatsächlich berechenbar: Wohnfläche ist an jeder Einheit erfasst,
// Verbrauch/Personenzahl/Miteigentumsanteil dagegen nirgends in der App erfasst. Kostenarten mit
// einem anderen (oder keinem) Verteilerschlüssel werden bewusst ausgeschlossen und dem Nutzer
// gemeldet, statt mit falschen Annahmen zu rechnen oder die ganze Abrechnung zu blockieren.
const UNTERSTUETZTE_VERTEILERSCHLUESSEL: ReadonlySet<VerteilerschluesselTyp> = new Set([
  "WOHNFLAECHE",
  "EINHEITEN",
]);

export type KostenpositionFuerAbrechnung = {
  betrag: number;
  gebaeudeId: string | null;
  hausId: string | null;
  verteilerschluessel: VerteilerschluesselTyp | null;
  kostenartName: string;
};

export type EinheitFuerAbrechnung = {
  id: string;
  bezeichnung: string;
  typ: "WOHNUNG" | "GARAGE";
  gebaeudeId: string;
  hausId: string | null;
  wohnflaecheQm: number;
};

export type MietvertragFuerAbrechnung = {
  id: string;
  einheitId: string;
  beginn: Date;
  ende: Date | null;
  nebenkostenVorauszahlung: number;
};

export type AbrechnungPositionErgebnis = {
  einheitId: string;
  mietvertragId: string;
  zeitraumVon: Date;
  zeitraumBis: Date;
  kostenanteilGesamt: number;
  vorauszahlungGesamt: number;
  saldo: number;
};

export type NichtBeruecksichtigteKostenart = {
  kostenartName: string;
  verteilerschluessel: VerteilerschluesselTyp | null;
  summe: number;
};

export type AbrechnungErgebnis = {
  positionen: AbrechnungPositionErgebnis[];
  nichtBeruecksichtigteKostenarten: NichtBeruecksichtigteKostenart[];
};

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

function tageZwischen(von: Date, bis: Date): number {
  // +1, weil sowohl der erste als auch der letzte Tag zum Zeitraum zählen (inklusive Grenzen).
  return Math.round((bis.getTime() - von.getTime()) / MS_PRO_TAG) + 1;
}

function tageImJahr(jahr: number): number {
  return (new Date(Date.UTC(jahr, 11, 31)).getTime() - new Date(Date.UTC(jahr, 0, 1)).getTime()) / MS_PRO_TAG + 1;
}

/**
 * Kostenpositionen, die wegen eines noch nicht unterstützten (oder fehlenden)
 * Verteilerschlüssels nicht in die Berechnung einfließen, gruppiert nach Kostenart. Auch separat
 * exportiert, damit die Detailseite einer bestehenden Abrechnung diesen Hinweis jederzeit aktuell
 * anzeigen kann, ohne die ganze Abrechnung neu zu berechnen.
 */
export function ermittleNichtBeruecksichtigteKostenarten(
  kostenpositionen: KostenpositionFuerAbrechnung[],
): NichtBeruecksichtigteKostenart[] {
  const nichtBeruecksichtigtProKostenart = new Map<string, NichtBeruecksichtigteKostenart>();
  for (const kp of kostenpositionen) {
    if (kp.verteilerschluessel && UNTERSTUETZTE_VERTEILERSCHLUESSEL.has(kp.verteilerschluessel)) continue;
    const bisherig = nichtBeruecksichtigtProKostenart.get(kp.kostenartName);
    nichtBeruecksichtigtProKostenart.set(kp.kostenartName, {
      kostenartName: kp.kostenartName,
      verteilerschluessel: kp.verteilerschluessel,
      summe: (bisherig?.summe ?? 0) + kp.betrag,
    });
  }
  return [...nichtBeruecksichtigtProKostenart.values()];
}

function berechneEinheitAnteile(
  kostenpositionen: KostenpositionFuerAbrechnung[],
  einheiten: EinheitFuerAbrechnung[],
): { anteilProEinheit: Map<string, number>; nichtBeruecksichtigt: NichtBeruecksichtigteKostenart[] } {
  const wohnungen = einheiten.filter((e) => e.typ === "WOHNUNG");
  const anteilProEinheit = new Map<string, number>(wohnungen.map((e) => [e.id, 0]));
  const nichtBeruecksichtigt = ermittleNichtBeruecksichtigteKostenarten(kostenpositionen);

  for (const kp of kostenpositionen) {
    if (!kp.verteilerschluessel || !UNTERSTUETZTE_VERTEILERSCHLUESSEL.has(kp.verteilerschluessel)) {
      continue;
    }

    const pool = kp.hausId
      ? wohnungen.filter((e) => e.hausId === kp.hausId)
      : kp.gebaeudeId
        ? wohnungen.filter((e) => e.gebaeudeId === kp.gebaeudeId)
        : wohnungen;
    if (pool.length === 0) continue;

    if (kp.verteilerschluessel === "WOHNFLAECHE") {
      const gesamtflaeche = pool.reduce((s, e) => s + e.wohnflaecheQm, 0);
      if (gesamtflaeche <= 0) continue;
      for (const e of pool) {
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + kp.betrag * (e.wohnflaecheQm / gesamtflaeche));
      }
    } else {
      // EINHEITEN
      const anteilProKopf = kp.betrag / pool.length;
      for (const e of pool) {
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteilProKopf);
      }
    }
  }

  return { anteilProEinheit, nichtBeruecksichtigt };
}

/**
 * Berechnet eine vollständige Nebenkostenabrechnung für ein Jahr. Erzeugt pro Einheit und
 * Mietvertrag eine Position — bei einem Mieterwechsel während des Jahres also mehrere Positionen
 * für dieselbe Einheit, jede zeitanteilig nur für den Zeitraum, den der jeweilige Mietvertrag die
 * Einheit tatsächlich innehatte. Zeiten ohne aktiven Mietvertrag (Leerstand) erzeugen bewusst
 * keine Position — der Kostenanteil für diesen Zeitraum bleibt unberechnet (trägt der
 * Eigentümer), verzerrt aber nicht den Anteil der anderen Einheiten, da die Verteilerschlüssel-
 * Berechnung unabhängig vom Vermietungsstatus auf der vollen Wohnfläche/Einheitenzahl basiert.
 * Garagen werden komplett ausgelassen (keine Nebenkosten laut Mietvertragsstruktur).
 */
export function berechneNebenkostenabrechnung(
  jahr: number,
  kostenpositionen: KostenpositionFuerAbrechnung[],
  einheiten: EinheitFuerAbrechnung[],
  mietvertraege: MietvertragFuerAbrechnung[],
): AbrechnungErgebnis {
  const { anteilProEinheit, nichtBeruecksichtigt } = berechneEinheitAnteile(kostenpositionen, einheiten);

  const jahresanfang = new Date(Date.UTC(jahr, 0, 1));
  const jahresende = new Date(Date.UTC(jahr, 11, 31));
  const tageGesamt = tageImJahr(jahr);

  const positionen: AbrechnungPositionErgebnis[] = [];
  for (const [einheitId, kostenanteilJahr] of anteilProEinheit) {
    const relevanteVertraege = mietvertraege.filter(
      (m) => m.einheitId === einheitId && m.beginn <= jahresende && (m.ende === null || m.ende >= jahresanfang),
    );

    for (const mv of relevanteVertraege) {
      const von = mv.beginn > jahresanfang ? mv.beginn : jahresanfang;
      const bisKandidat = mv.ende !== null && mv.ende < jahresende ? mv.ende : jahresende;
      const bis = bisKandidat;
      const tage = tageZwischen(von, bis);
      const zeitanteil = tage / tageGesamt;

      const kostenanteilGesamt = round2(kostenanteilJahr * zeitanteil);
      const vorauszahlungGesamt = round2(mv.nebenkostenVorauszahlung * 12 * zeitanteil);

      positionen.push({
        einheitId,
        mietvertragId: mv.id,
        zeitraumVon: von,
        zeitraumBis: bis,
        kostenanteilGesamt,
        vorauszahlungGesamt,
        saldo: round2(vorauszahlungGesamt - kostenanteilGesamt),
      });
    }
  }

  return { positionen, nichtBeruecksichtigteKostenarten: nichtBeruecksichtigt };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
