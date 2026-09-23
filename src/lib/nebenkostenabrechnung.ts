// Berechnungs-Engine für die Nebenkostenabrechnung. Reine Funktionen auf einfachen Datenstrukturen
// (kein Prisma-Import hier) — die aufrufende Server Action lädt die Daten und übergibt sie, das
// macht die Berechnung isoliert testbar (z.B. per tsx-Skript gegen echte Daten). Kosten können auf
// fünf Ebenen liegen (Objekt gesamt, Haus, Kostengruppe, einzelnes Gebäude, einzelne Einheit) —
// der Pool der betroffenen Einheiten wird je Kostenposition passend dazu ermittelt.

export type VerteilerschluesselTyp =
  | "WOHNFLAECHE"
  | "MITEIGENTUMSANTEIL"
  | "PERSONENZAHL"
  | "EINHEITEN"
  | "VERBRAUCH_MANUELL"
  | "VORVERTEILT"
  | "IN_ABRECHNUNG_ENTHALTEN";

export type KostenpositionFuerAbrechnung = {
  betrag: number;
  gebaeudeId: string | null;
  hausId: string | null;
  // Frei zusammengestellte Gruppe mehrerer Gebäude über Haus-Grenzen hinweg (z.B. wenn ein
  // Versorger mehrere Häuser gemeinsam abrechnet) — höchstens eins von gebaeudeId/hausId/
  // kostengruppeId/einheitId ist gesetzt.
  kostengruppeId: string | null;
  // Spezifischste Ebene: Kosten, die nur eine einzelne Wohnung betreffen (z.B. eine
  // Kleinreparatur) — der Pool besteht dann nur aus dieser einen Einheit.
  einheitId: string | null;
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
  // Historie von Mieterhöhungen, siehe MietvertragFuerSollIst.mieterhoehungen in soll-ist.ts —
  // leeres Array = unverändert wie bisher (Basiswert gilt die ganze Laufzeit).
  mieterhoehungen?: { gueltigAb: Date; kaltmiete: number; nebenkostenVorauszahlung: number }[];
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

export type AusschlussGrund =
  | "kein_verteilerschluessel"
  | "unvollstaendige_verbrauchswerte"
  | "vorverteilt"
  | "in_abrechnung_enthalten";

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
  kp: Pick<KostenpositionFuerAbrechnung, "gebaeudeId" | "hausId" | "kostengruppeId" | "einheitId">,
  wohnungen: EinheitFuerAbrechnung[],
): EinheitFuerAbrechnung[] {
  if (kp.einheitId) return wohnungen.filter((e) => e.id === kp.einheitId);
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
 * - "in_abrechnung_enthalten": IN_ABRECHNUNG_ENTHALTEN — Kosten stecken schon in den extern
 *   vorverteilten Beträgen (Techem enthält Heizung, Wasser, Gas und Strom), keine eigene Berechnung
 *   und keine eigene Eingabe.
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
  scope: Pick<KostenpositionFuerAbrechnung, "gebaeudeId" | "hausId" | "kostengruppeId" | "einheitId">;
  verteilerschluessel: VerteilerschluesselTyp | null;
  masseinheit: string | null;
  betrag: number;
};

function gruppenSchluessel(
  kp: Pick<KostenpositionFuerAbrechnung, "kostenartId" | "gebaeudeId" | "hausId" | "kostengruppeId" | "einheitId">,
): string {
  const scope = kp.einheitId
    ? `einheit:${kp.einheitId}`
    : kp.kostengruppeId
      ? `kg:${kp.kostengruppeId}`
      : kp.hausId
        ? `haus:${kp.hausId}`
        : kp.gebaeudeId
          ? `geb:${kp.gebaeudeId}`
          : "objekt";
  return `${kp.kostenartId}|${scope}`;
}

// Verteilt einen Gesamtbetrag (in Cent, kann auch negativ sein — z.B. bei einer Gutschrift) exakt
// auf mehrere Empfänger nach Gewichten — Restwertverfahren ("größte Reste"): jeder Empfänger
// bekommt zunächst seinen auf den nächsten Cent gerundeten Anteil, danach wird die verbleibende
// Differenz (durch das Runden entstanden, ganzzahlig und betragsmäßig kleiner als die Anzahl der
// Empfänger) einzeln an die Empfänger mit dem größten Rundungsrest verteilt bzw. von ihnen
// abgezogen. Ergebnis: die Summe aller zurückgegebenen Cent-Beträge entspricht immer exakt
// `gesamtCent` — anders als bei unabhängigem Runden jedes Anteils für sich, wo sich Rundungsfehler
// über viele Einheiten/Kostenarten zu einer Differenz zum tatsächlich gebuchten Betrag aufsummieren
// können.
function verteileRestcent(gesamtCent: number, gewichte: number[]): number[] {
  const gewichtSumme = gewichte.reduce((s, g) => s + g, 0);
  if (gewichtSumme <= 0 || gewichte.length === 0) return gewichte.map(() => 0);

  const rohAnteile = gewichte.map((g) => (gesamtCent * g) / gewichtSumme);
  const basis = rohAnteile.map((a) => Math.round(a));
  let diff = gesamtCent - basis.reduce((s, b) => s + b, 0);

  const reste = rohAnteile.map((a, i) => ({ i, rest: a - basis[i] }));
  reste.sort((a, b) => (diff > 0 ? b.rest - a.rest : a.rest - b.rest));

  const ergebnis = [...basis];
  for (let k = 0; k < reste.length && diff !== 0; k++) {
    ergebnis[reste[k].i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  return ergebnis;
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
      scope: {
        gebaeudeId: kp.gebaeudeId,
        hausId: kp.hausId,
        kostengruppeId: kp.kostengruppeId,
        einheitId: kp.einheitId,
      },
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
    if (g.verteilerschluessel === "IN_ABRECHNUNG_ENTHALTEN") {
      vermerkeAusschluss(nichtBeruecksichtigt, g, "in_abrechnung_enthalten");
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
      const verteilerschluessel = g.verteilerschluessel;
      const gesamtflaeche = pool.reduce((s, e) => s + e.wohnflaecheQm, 0);
      if (gesamtflaeche <= 0) continue;
      const centAnteile = verteileRestcent(
        Math.round(g.betrag * 100),
        pool.map((e) => e.wohnflaecheQm),
      );
      pool.forEach((e, i) => {
        const anteil = centAnteile[i] / 100;
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteil);
        pushDetail(detailsProEinheit, e.id, {
          kostenartId: g.kostenartId,
          kostenartName: g.kostenartName,
          scopeLabel: g.scopeLabel,
          verteilerschluessel,
          gesamtbetragPool: g.betrag,
          einheitMasswert: e.wohnflaecheQm,
          poolMasswert: gesamtflaeche,
          masseinheit: "m²",
          anteilJahr: anteil,
        });
      });
    } else if (g.verteilerschluessel === "EINHEITEN") {
      const verteilerschluessel = g.verteilerschluessel;
      const centAnteile = verteileRestcent(
        Math.round(g.betrag * 100),
        pool.map(() => 1),
      );
      pool.forEach((e, i) => {
        const anteil = centAnteile[i] / 100;
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteil);
        pushDetail(detailsProEinheit, e.id, {
          kostenartId: g.kostenartId,
          kostenartName: g.kostenartName,
          scopeLabel: g.scopeLabel,
          verteilerschluessel,
          gesamtbetragPool: g.betrag,
          einheitMasswert: 1,
          poolMasswert: pool.length,
          masseinheit: "Einheiten",
          anteilJahr: anteil,
        });
      });
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
      const verteilerschluessel = g.verteilerschluessel;
      const centAnteile = verteileRestcent(
        Math.round(g.betrag * 100),
        pool.map((e) => werteProEinheit.get(e.id) ?? 0),
      );
      pool.forEach((e, i) => {
        const wert = werteProEinheit.get(e.id) ?? 0;
        const anteil = centAnteile[i] / 100;
        anteilProEinheit.set(e.id, (anteilProEinheit.get(e.id) ?? 0) + anteil);
        pushDetail(detailsProEinheit, e.id, {
          kostenartId: g.kostenartId,
          kostenartName: g.kostenartName,
          scopeLabel: g.scopeLabel,
          verteilerschluessel,
          gesamtbetragPool: g.betrag,
          einheitMasswert: wert,
          poolMasswert: gesamtwert,
          masseinheit: g.masseinheit ?? "",
          anteilJahr: anteil,
        });
      });
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
      const vorauszahlungGesamt = round2(vorauszahlungFuerZeitraum(mv, von, bis, tageGesamt));

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

/** Der erste Tag des Kalendermonats von `datum` — Mieterhöhungen gelten "ab diesem Monat", der
 * konkrete Tag im gespeicherten gueltigAb-Wert ist irrelevant (siehe Schema-Kommentar). */
function ersterTagDesMonats(datum: Date): Date {
  return new Date(datum.getFullYear(), datum.getMonth(), 1);
}

/** Die zu `datum` passende NK-Vorauszahlung: die letzte Mieterhöhung, deren (auf Monatsanfang
 * normiertes) gueltigAb kleiner-gleich `datum` ist, sonst der Basiswert des Mietvertrags. */
function nkVorauszahlungFuerDatum(
  mv: Pick<MietvertragFuerAbrechnung, "nebenkostenVorauszahlung" | "mieterhoehungen">,
  datum: Date,
): number {
  let aktuell = mv.nebenkostenVorauszahlung;
  let bestesGueltigAb: Date | null = null;
  for (const mh of mv.mieterhoehungen ?? []) {
    const gueltigAb = ersterTagDesMonats(mh.gueltigAb);
    if (gueltigAb <= datum && (!bestesGueltigAb || gueltigAb > bestesGueltigAb)) {
      bestesGueltigAb = gueltigAb;
      aktuell = mh.nebenkostenVorauszahlung;
    }
  }
  return aktuell;
}

/**
 * Segment-Summe der NK-Vorauszahlung über [von, bis]: der Zeitraum wird an jedem (auf
 * Monatsanfang normierten) gueltigAb einer Mieterhöhung, das in (von, bis] fällt, in
 * Teilabschnitte zerlegt — pro Abschnitt gilt die zu dessen Start passende NK-Vorauszahlung, mit
 * derselben Tagesanteil-Formel wie bisher. Ohne Mieterhöhung im Zeitraum ergibt das exakt einen
 * Abschnitt über den vollen Zeitraum — reine Verallgemeinerung, kein Verhaltensunterschied im
 * Normalfall.
 */
function vorauszahlungFuerZeitraum(
  mv: Pick<MietvertragFuerAbrechnung, "nebenkostenVorauszahlung" | "mieterhoehungen">,
  von: Date,
  bis: Date,
  tageGesamt: number,
): number {
  const breakpoints = [...new Set((mv.mieterhoehungen ?? []).map((mh) => ersterTagDesMonats(mh.gueltigAb).getTime()))]
    .map((t) => new Date(t))
    .filter((d) => d > von && d <= bis)
    .sort((a, b) => a.getTime() - b.getTime());

  const grenzen = [von, ...breakpoints, new Date(bis.getTime() + MS_PRO_TAG)];
  let summe = 0;
  for (let i = 0; i < grenzen.length - 1; i++) {
    const segStart = grenzen[i];
    const segEnde = new Date(grenzen[i + 1].getTime() - MS_PRO_TAG);
    const rate = nkVorauszahlungFuerDatum(mv, segStart);
    const tage = tageZwischen(segStart, segEnde);
    summe += ((rate * 12) / tageGesamt) * tage;
  }
  return summe;
}
