// Berechnungs-Engine für die Nebenkostenabrechnung. Reine Funktionen auf einfachen Datenstrukturen
// (kein Prisma-Import hier) — die aufrufende Server Action lädt die Daten und übergibt sie, das
// macht die Berechnung isoliert testbar (z.B. per tsx-Skript gegen echte Daten). Kosten können auf
// vier Ebenen liegen (Objekt gesamt, Haus, Kostengruppe, einzelnes Gebäude) — der Pool der
// betroffenen Einheiten wird je Kostenposition passend dazu ermittelt.

export type VerteilerschluesselTyp =
  | "WOHNFLAECHE"
  | "MITEIGENTUMSANTEIL"
  | "PERSONENZAHL"
  | "EINHEITEN"
  | "VERBRAUCH_MANUELL"
  | "VORVERTEILT";

export type KostenpositionFuerAbrechnung = {
  betrag: number;
  gebaeudeId: string | null;
  hausId: string | null;
  // Frei zusammengestellte Gruppe mehrerer Gebäude über Haus-Grenzen hinweg (z.B. wenn ein
  // Versorger mehrere Häuser gemeinsam abrechnet) — höchstens eins von gebaeudeId/hausId/
  // kostengruppeId ist gesetzt.
  kostengruppeId: string | null;
  kostenartId: string;
  verteilerschluessel: VerteilerschluesselTyp | null;
  kostenartName: string;
};

export type EinheitFuerAbrechnung = {
  id: string;
  bezeichnung: string;
  typ: "WOHNUNG" | "GARAGE";
  gebaeudeId: string;
  hausId: string | null;
  kostengruppenIds: string[];
  wohnflaecheQm: number;
};

export type MietvertragFuerAbrechnung = {
  id: string;
  einheitId: string;
  beginn: Date | null; // null = unbekannt, wird wie ein beliebig weit zurückliegendes Datum behandelt
  ende: Date | null;
  nebenkostenVorauszahlung: number;
};

// Ein erfasster Ablesewert (z.B. Zählerstand-Differenz) für eine Einheit, Kostenart und Jahr —
// Grundlage der Verteilung bei Verteilerschlüssel VERBRAUCH_MANUELL.
export type VerbrauchswertFuerAbrechnung = {
  einheitId: string;
  kostenartId: string;
  jahr: number;
  wert: number;
};

// Der tatsächliche, extern (z.B. von Techem) schon korrekt pro Mieter berechnete Anteil einer
// Kostenart mit Verteilerschlüssel VORVERTEILT — wird nicht wie die anderen Verteilerschlüssel im
// Pool verrechnet, sondern direkt auf die Position des jeweiligen Mietvertrags addiert (Techems
// eigener Betrag hat den Zeitanteil bei einem Mieterwechsel schon eingerechnet, siehe
// VorverteilterKostenanteil in schema.prisma).
export type VorverteilterKostenanteilFuerAbrechnung = {
  mietvertragId: string;
  kostenartId: string;
  jahr: number;
  betrag: number;
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

export type AusschlussGrund = "kein_verteilerschluessel" | "unvollstaendige_verbrauchswerte" | "vorverteilt";

export type NichtBeruecksichtigteKostenart = {
  kostenartName: string;
  verteilerschluessel: VerteilerschluesselTyp | null;
  grund: AusschlussGrund;
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

function ermittlePool(
  kp: Pick<KostenpositionFuerAbrechnung, "gebaeudeId" | "hausId" | "kostengruppeId">,
  wohnungen: EinheitFuerAbrechnung[],
): EinheitFuerAbrechnung[] {
  if (kp.kostengruppeId) return wohnungen.filter((e) => e.kostengruppenIds.includes(kp.kostengruppeId!));
  if (kp.hausId) return wohnungen.filter((e) => e.hausId === kp.hausId);
  if (kp.gebaeudeId) return wohnungen.filter((e) => e.gebaeudeId === kp.gebaeudeId);
  return wohnungen;
}

function vermerkeAusschluss(
  nichtBeruecksichtigt: Map<string, NichtBeruecksichtigteKostenart>,
  kp: KostenpositionFuerAbrechnung,
  grund: AusschlussGrund,
) {
  const bisherig = nichtBeruecksichtigt.get(kp.kostenartName);
  nichtBeruecksichtigt.set(kp.kostenartName, {
    kostenartName: kp.kostenartName,
    verteilerschluessel: kp.verteilerschluessel,
    grund: bisherig?.grund ?? grund,
    summe: (bisherig?.summe ?? 0) + kp.betrag,
  });
}

/**
 * Ermittelt, welche Kostenpositionen nicht in die Berechnung einfließen, mit Grund:
 * - "vorverteilt": Verteilerschlüssel VORVERTEILT — wird bewusst nie selbst berechnet (z.B.
 *   Techem-Heizkosten, deren Pro-Mieter-Aufteilung separat importiert wird).
 * - "unvollstaendige_verbrauchswerte": VERBRAUCH_MANUELL, aber für mindestens eine Einheit im
 *   betroffenen Kostenpool fehlt ein erfasster Wert für dieses Jahr — die ganze Kostenart wird
 *   dann komplett ausgeschlossen statt die fehlende Einheit stillschweigend zu übergehen (das
 *   würde sonst die erfassten Einheiten unbemerkt benachteiligen).
 * - "kein_verteilerschluessel": kein oder ein (noch) nicht unterstützter Verteilerschlüssel
 *   (MITEIGENTUMSANTEIL/PERSONENZAHL — dafür gibt es aktuell keine erfassten Vergleichsdaten).
 *
 * Auch separat exportiert, damit die Detailseite einer bestehenden Abrechnung diesen Hinweis
 * jederzeit aktuell anzeigen kann, ohne die ganze Abrechnung neu zu berechnen.
 */
export function ermittleNichtBeruecksichtigteKostenarten(
  jahr: number,
  kostenpositionen: KostenpositionFuerAbrechnung[],
  einheiten: EinheitFuerAbrechnung[],
  verbrauchswerte: VerbrauchswertFuerAbrechnung[],
): NichtBeruecksichtigteKostenart[] {
  return berechneEinheitAnteile(jahr, kostenpositionen, einheiten, verbrauchswerte).nichtBeruecksichtigt;
}

function berechneEinheitAnteile(
  jahr: number,
  kostenpositionen: KostenpositionFuerAbrechnung[],
  einheiten: EinheitFuerAbrechnung[],
  verbrauchswerte: VerbrauchswertFuerAbrechnung[],
): { anteilProEinheit: Map<string, number>; nichtBeruecksichtigt: NichtBeruecksichtigteKostenart[] } {
  const wohnungen = einheiten.filter((e) => e.typ === "WOHNUNG");
  const anteilProEinheit = new Map<string, number>(wohnungen.map((e) => [e.id, 0]));
  const nichtBeruecksichtigt = new Map<string, NichtBeruecksichtigteKostenart>();

  for (const kp of kostenpositionen) {
    if (kp.verteilerschluessel === "VORVERTEILT") {
      vermerkeAusschluss(nichtBeruecksichtigt, kp, "vorverteilt");
      continue;
    }
    if (
      kp.verteilerschluessel !== "WOHNFLAECHE" &&
      kp.verteilerschluessel !== "EINHEITEN" &&
      kp.verteilerschluessel !== "VERBRAUCH_MANUELL"
    ) {
      vermerkeAusschluss(nichtBeruecksichtigt, kp, "kein_verteilerschluessel");
      continue;
    }

    const pool = ermittlePool(kp, wohnungen);
    if (pool.length === 0) continue;

    if (kp.verteilerschluessel === "WOHNFLAECHE") {
      const gesamtflaeche = pool.reduce((s, e) => s + e.wohnflaecheQm, 0);
      if (gesamtflaeche <= 0) continue;
      for (const e of pool) {
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + kp.betrag * (e.wohnflaecheQm / gesamtflaeche));
      }
    } else if (kp.verteilerschluessel === "EINHEITEN") {
      const anteilProKopf = kp.betrag / pool.length;
      for (const e of pool) {
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteilProKopf);
      }
    } else {
      // VERBRAUCH_MANUELL: Werte pro Einheit für diese Kostenart+Jahr nachschlagen. Fehlt auch
      // nur einer im Pool, wird die ganze Kostenart ausgeschlossen (siehe Doku oben) statt
      // teilweise berechnet.
      const werteProEinheit = new Map<string, number>();
      let vollstaendig = true;
      for (const e of pool) {
        const eintrag = verbrauchswerte.find(
          (v) => v.einheitId === e.id && v.kostenartId === kp.kostenartId && v.jahr === jahr,
        );
        if (!eintrag) {
          vollstaendig = false;
          break;
        }
        werteProEinheit.set(e.id, eintrag.wert);
      }
      if (!vollstaendig) {
        vermerkeAusschluss(nichtBeruecksichtigt, kp, "unvollstaendige_verbrauchswerte");
        continue;
      }
      const gesamtwert = [...werteProEinheit.values()].reduce((s, w) => s + w, 0);
      if (gesamtwert <= 0) continue;
      for (const e of pool) {
        const wert = werteProEinheit.get(e.id) ?? 0;
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + kp.betrag * (wert / gesamtwert));
      }
    }
  }

  return { anteilProEinheit, nichtBeruecksichtigt: [...nichtBeruecksichtigt.values()] };
}

/**
 * Berechnet eine vollständige Nebenkostenabrechnung für ein Jahr. Erzeugt pro Einheit und
 * Mietvertrag eine Position — bei einem Mieterwechsel während des Jahres also mehrere Positionen
 * für dieselbe Einheit, jede zeitanteilig nur für den Zeitraum, den der jeweilige Mietvertrag die
 * Einheit tatsächlich innehatte. Zeiten ohne aktiven Mietvertrag (Leerstand) erzeugen bewusst
 * keine Position — der Kostenanteil für diesen Zeitraum bleibt unberechnet (trägt der
 * Eigentümer), verzerrt aber nicht den Anteil der anderen Einheiten, da die Verteilerschlüssel-
 * Berechnung unabhängig vom Vermietungsstatus auf der vollen Wohnfläche/Einheitenzahl/Verbrauch
 * basiert. Garagen werden komplett ausgelassen (keine Nebenkosten laut Mietvertragsstruktur).
 */
export function berechneNebenkostenabrechnung(
  jahr: number,
  kostenpositionen: KostenpositionFuerAbrechnung[],
  einheiten: EinheitFuerAbrechnung[],
  mietvertraege: MietvertragFuerAbrechnung[],
  verbrauchswerte: VerbrauchswertFuerAbrechnung[] = [],
  vorverteilteAnteile: VorverteilterKostenanteilFuerAbrechnung[] = [],
): AbrechnungErgebnis {
  const { anteilProEinheit, nichtBeruecksichtigt } = berechneEinheitAnteile(
    jahr,
    kostenpositionen,
    einheiten,
    verbrauchswerte,
  );

  const jahresanfang = new Date(Date.UTC(jahr, 0, 1));
  const jahresende = new Date(Date.UTC(jahr, 11, 31));
  const tageGesamt = tageImJahr(jahr);

  const positionen: AbrechnungPositionErgebnis[] = [];
  for (const [einheitId, kostenanteilJahr] of anteilProEinheit) {
    const relevanteVertraege = mietvertraege.filter(
      (m) =>
        m.einheitId === einheitId &&
        (m.beginn === null || m.beginn <= jahresende) &&
        (m.ende === null || m.ende >= jahresanfang),
    );

    for (const mv of relevanteVertraege) {
      const von = mv.beginn !== null && mv.beginn > jahresanfang ? mv.beginn : jahresanfang;
      const bisKandidat = mv.ende !== null && mv.ende < jahresende ? mv.ende : jahresende;
      const bis = bisKandidat;
      const tage = tageZwischen(von, bis);
      const zeitanteil = tage / tageGesamt;

      // Vorverteilter Anteil (z.B. Techem-Heizkosten) kommt ohne erneute Zeitanteil-Prorata
      // obendrauf — siehe VorverteilterKostenanteilFuerAbrechnung oben.
      const vorverteilterAnteil = vorverteilteAnteile
        .filter((v) => v.mietvertragId === mv.id && v.jahr === jahr)
        .reduce((s, v) => s + v.betrag, 0);

      const kostenanteilGesamt = round2(kostenanteilJahr * zeitanteil + vorverteilterAnteil);
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
