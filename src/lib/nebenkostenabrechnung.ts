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
  // Anzeige-Label des Kostenkreises (z.B. "Haus 5, 7, 9 (Breslauer Str.)" oder "Objekt gesamt") —
  // vorberechnet übergeben (statt hier aus Gebäude/Haus/Kostengruppe abgeleitet), damit diese
  // reine Berechnungs-Engine ohne Prisma-Zugriff auskommt.
  scopeLabel: string;
  // Nur bei VERBRAUCH_MANUELL relevant (z.B. "kWh", "m³") — für die Anzeige der Verteilungsbasis.
  masseinheit: string | null;
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
  kostenartName: string;
  jahr: number;
  betrag: number;
};

// Ein vollständig nachvollziehbarer Beleg-Eintrag für eine einzelne Kostenart innerhalb einer
// Position: der Gesamtbetrag dieser Kostenart in ihrem Kostenkreis (z.B. "Grundsteuer Haus 5, 7, 9"
// für das ganze Jahr), die Verteilungsbasis (z.B. Wohnfläche der Einheit von der Gesamtwohnfläche
// des Kreises) und der daraus resultierende Anteil — einmal für das volle Jahr (anteilJahr) und
// einmal tatsächlich in kostenanteilGesamt eingeflossen (anteilZeitraum, nach Zeitanteil-Prorata
// bei einem unterjährigen Mietvertrag). Summe aller anteilZeitraum-Werte einer Position ergibt
// (bis auf Rundung) kostenanteilGesamt.
export type KostenanteilDetailEintrag = {
  kostenartId: string;
  kostenartName: string;
  scopeLabel: string;
  verteilerschluessel: VerteilerschluesselTyp;
  gesamtbetragPool: number;
  einheitMasswert: number;
  poolMasswert: number;
  masseinheit: string;
  anteilJahr: number;
  anteilZeitraum: number;
};

// Wie KostenanteilDetailEintrag, aber noch ohne Zeitanteil-Prorata — wird pro Einheit für das
// ganze Jahr ermittelt (berechneEinheitAnteile), dann pro Mietvertrag/Zeitraum skaliert
// (berechneNebenkostenabrechnung).
type KostenanteilJahrDetail = Omit<KostenanteilDetailEintrag, "anteilZeitraum">;

export type AbrechnungPositionErgebnis = {
  einheitId: string;
  mietvertragId: string;
  zeitraumVon: Date;
  zeitraumBis: Date;
  kostenanteilGesamt: number;
  vorauszahlungGesamt: number;
  saldo: number;
  details: KostenanteilDetailEintrag[];
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
  kp: Pick<KostenpositionFuerAbrechnung, "kostenartName" | "verteilerschluessel" | "betrag">,
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

// Gruppiert Kostenpositionen nach Kostenart+Kostenkreis (Gebäude/Haus/Kostengruppe/Objekt), damit
// z.B. zwei Grundsteuer-Rechnungen für Haus 5, 7, 9 im selben Jahr als ein gemeinsamer
// Gesamtbetrag in der Aufschlüsselung erscheinen, statt als zwei separate Zeilen.
type KostenartGruppe = {
  kostenartId: string;
  kostenartName: string;
  scopeLabel: string;
  scope: Pick<KostenpositionFuerAbrechnung, "gebaeudeId" | "hausId" | "kostengruppeId">;
  verteilerschluessel: VerteilerschluesselTyp | null;
  masseinheit: string | null;
  betrag: number;
};

function gruppenSchluessel(
  kp: Pick<KostenpositionFuerAbrechnung, "kostenartId" | "gebaeudeId" | "hausId" | "kostengruppeId">,
): string {
  const scope = kp.kostengruppeId
    ? `kg:${kp.kostengruppeId}`
    : kp.hausId
      ? `haus:${kp.hausId}`
      : kp.gebaeudeId
        ? `geb:${kp.gebaeudeId}`
        : "objekt";
  return `${kp.kostenartId}|${scope}`;
}

function pushDetail(
  detailsProEinheit: Map<string, KostenanteilJahrDetail[]>,
  einheitId: string,
  eintrag: KostenanteilJahrDetail,
) {
  const liste = detailsProEinheit.get(einheitId);
  if (liste) liste.push(eintrag);
  else detailsProEinheit.set(einheitId, [eintrag]);
}

function berechneEinheitAnteile(
  jahr: number,
  kostenpositionen: KostenpositionFuerAbrechnung[],
  einheiten: EinheitFuerAbrechnung[],
  verbrauchswerte: VerbrauchswertFuerAbrechnung[],
): {
  anteilProEinheit: Map<string, number>;
  detailsProEinheit: Map<string, KostenanteilJahrDetail[]>;
  nichtBeruecksichtigt: NichtBeruecksichtigteKostenart[];
} {
  const wohnungen = einheiten.filter((e) => e.typ === "WOHNUNG");
  const anteilProEinheit = new Map<string, number>(wohnungen.map((e) => [e.id, 0]));
  const detailsProEinheit = new Map<string, KostenanteilJahrDetail[]>();
  const nichtBeruecksichtigt = new Map<string, NichtBeruecksichtigteKostenart>();

  const gruppen = new Map<string, KostenartGruppe>();
  for (const kp of kostenpositionen) {
    const schluessel = gruppenSchluessel(kp);
    const bisherig = gruppen.get(schluessel);
    gruppen.set(schluessel, {
      kostenartId: kp.kostenartId,
      kostenartName: kp.kostenartName,
      scopeLabel: kp.scopeLabel,
      scope: { gebaeudeId: kp.gebaeudeId, hausId: kp.hausId, kostengruppeId: kp.kostengruppeId },
      verteilerschluessel: kp.verteilerschluessel,
      masseinheit: kp.masseinheit,
      betrag: (bisherig?.betrag ?? 0) + kp.betrag,
    });
  }

  for (const g of gruppen.values()) {
    if (g.verteilerschluessel === "VORVERTEILT") {
      vermerkeAusschluss(nichtBeruecksichtigt, g, "vorverteilt");
      continue;
    }
    if (
      g.verteilerschluessel !== "WOHNFLAECHE" &&
      g.verteilerschluessel !== "EINHEITEN" &&
      g.verteilerschluessel !== "VERBRAUCH_MANUELL"
    ) {
      vermerkeAusschluss(nichtBeruecksichtigt, g, "kein_verteilerschluessel");
      continue;
    }

    const pool = ermittlePool(g.scope, wohnungen);
    if (pool.length === 0) continue;

    if (g.verteilerschluessel === "WOHNFLAECHE") {
      const gesamtflaeche = pool.reduce((s, e) => s + e.wohnflaecheQm, 0);
      if (gesamtflaeche <= 0) continue;
      for (const e of pool) {
        const anteil = g.betrag * (e.wohnflaecheQm / gesamtflaeche);
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteil);
        pushDetail(detailsProEinheit, e.id, {
          kostenartId: g.kostenartId,
          kostenartName: g.kostenartName,
          scopeLabel: g.scopeLabel,
          verteilerschluessel: g.verteilerschluessel,
          gesamtbetragPool: g.betrag,
          einheitMasswert: e.wohnflaecheQm,
          poolMasswert: gesamtflaeche,
          masseinheit: "m²",
          anteilJahr: anteil,
        });
      }
    } else if (g.verteilerschluessel === "EINHEITEN") {
      const anteilProKopf = g.betrag / pool.length;
      for (const e of pool) {
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteilProKopf);
        pushDetail(detailsProEinheit, e.id, {
          kostenartId: g.kostenartId,
          kostenartName: g.kostenartName,
          scopeLabel: g.scopeLabel,
          verteilerschluessel: g.verteilerschluessel,
          gesamtbetragPool: g.betrag,
          einheitMasswert: 1,
          poolMasswert: pool.length,
          masseinheit: "Einheiten",
          anteilJahr: anteilProKopf,
        });
      }
    } else {
      // VERBRAUCH_MANUELL: Werte pro Einheit für diese Kostenart+Jahr nachschlagen. Fehlt auch
      // nur einer im Pool, wird die ganze Kostenart ausgeschlossen (siehe Doku oben) statt
      // teilweise berechnet.
      const werteProEinheit = new Map<string, number>();
      let vollstaendig = true;
      for (const e of pool) {
        const eintrag = verbrauchswerte.find(
          (v) => v.einheitId === e.id && v.kostenartId === g.kostenartId && v.jahr === jahr,
        );
        if (!eintrag) {
          vollstaendig = false;
          break;
        }
        werteProEinheit.set(e.id, eintrag.wert);
      }
      if (!vollstaendig) {
        vermerkeAusschluss(nichtBeruecksichtigt, g, "unvollstaendige_verbrauchswerte");
        continue;
      }
      const gesamtwert = [...werteProEinheit.values()].reduce((s, w) => s + w, 0);
      if (gesamtwert <= 0) continue;
      for (const e of pool) {
        const wert = werteProEinheit.get(e.id) ?? 0;
        const anteil = g.betrag * (wert / gesamtwert);
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteil);
        pushDetail(detailsProEinheit, e.id, {
          kostenartId: g.kostenartId,
          kostenartName: g.kostenartName,
          scopeLabel: g.scopeLabel,
          verteilerschluessel: g.verteilerschluessel,
          gesamtbetragPool: g.betrag,
          einheitMasswert: wert,
          poolMasswert: gesamtwert,
          masseinheit: g.masseinheit ?? "",
          anteilJahr: anteil,
        });
      }
    }
  }

  return { anteilProEinheit, detailsProEinheit, nichtBeruecksichtigt: [...nichtBeruecksichtigt.values()] };
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
  const { anteilProEinheit, detailsProEinheit, nichtBeruecksichtigt } = berechneEinheitAnteile(
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
      const vorverteilteEintraege = vorverteilteAnteile.filter((v) => v.mietvertragId === mv.id && v.jahr === jahr);
      const vorverteilterAnteil = vorverteilteEintraege.reduce((s, v) => s + v.betrag, 0);

      const kostenanteilGesamt = round2(kostenanteilJahr * zeitanteil + vorverteilterAnteil);
      const vorauszahlungGesamt = round2(mv.nebenkostenVorauszahlung * 12 * zeitanteil);

      // Vollständige Belegkette für diese Position: pro Kostenart der Jahresgesamtbetrag ihres
      // Kostenkreises, die Verteilungsbasis und der daraus resultierende, zeitanteilig auf diesen
      // Mietvertrag bezogene Anteil — Summe ergibt (bis auf Rundung) kostenanteilGesamt.
      const details: KostenanteilDetailEintrag[] = [
        ...(detailsProEinheit.get(einheitId) ?? []).map((d) => ({
          ...d,
          anteilZeitraum: d.anteilJahr * zeitanteil,
        })),
        ...vorverteilteEintraege.map((v) => ({
          kostenartId: v.kostenartId,
          kostenartName: v.kostenartName,
          scopeLabel: "Extern vorverteilt (z.B. Techem-Gesamtabrechnung)",
          verteilerschluessel: "VORVERTEILT" as const,
          gesamtbetragPool: v.betrag,
          einheitMasswert: 1,
          poolMasswert: 1,
          masseinheit: "",
          anteilJahr: v.betrag,
          anteilZeitraum: v.betrag,
        })),
      ];

      positionen.push({
        einheitId,
        mietvertragId: mv.id,
        zeitraumVon: von,
        zeitraumBis: bis,
        kostenanteilGesamt,
        vorauszahlungGesamt,
        saldo: round2(vorauszahlungGesamt - kostenanteilGesamt),
        details,
      });
    }
  }

  return { positionen, nichtBeruecksichtigteKostenarten: nichtBeruecksichtigt };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
