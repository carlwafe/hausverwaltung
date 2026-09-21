// Mieterkonto pro Jahr (Kontokorrent des Mietvertrags): je Monat eine Zeile mit Soll und der/den
// Zahlung(en) dieses Monats, dazu Sonderbuchungen (Gebühren, Zahlungen darauf) als eigene Zeilen,
// mit laufendem Saldo und dem Saldo-Übertrag aus dem Vorjahr. Reine Darstellung — der Saldo folgt
// aus denselben Zahlen wie der Mietsaldo auf der Mietvertragsseite (Zahlungen ./. Soll +
// Saldovortrag ./. offene Sonderforderung), gespeichert wird nichts. Mietzahlungen stehen im Monat
// der Mietperiode, für die sie gedacht sind (periodeMonat/periodeJahr) — dieselbe Rechnung wie in
// der Jahresübersicht (jahresbericht-mieter.ts), damit beide denselben Saldo zeigen. Sonderbuchungen
// (Gebühren) stehen im Monat ihres Buchungsdatums.
import type { SollZeile } from "./soll-ist";

export type MieterkontoZeile = {
  // Monat nur in der ersten Zeile eines Monats, sonst leer.
  monat: string;
  sollKaltmiete: number | null;
  sollNebenkosten: number | null;
  sollGesamt: number | null;
  buchungsart: string;
  datum: Date | null;
  betrag: number | null;
  differenz: number;
  saldo: number;
  bemerkung: string;
  href?: string;
  // Sonderbuchung (Gebühr / Zahlung darauf) — wird farblich abgesetzt.
  sonderbuchung: boolean;
};

export type MieterkontoJahr = {
  jahr: number;
  uebertragVorjahr: number;
  sollKaltmieteMonatlich: number;
  sollNebenkostenMonatlich: number;
  // Offener Saldo der Nebenkostenabrechnung des Vorjahres (positiv = noch auszuzahlendes Guthaben,
  // negativ = noch einzuziehende Nachzahlung), null = keine Abrechnung vorhanden. Wie in der
  // Jahresübersicht fließt sie nur in den Saldo am Jahresende ein, nicht in den Übertrag.
  nebenkostenabrechnungOffen: number | null;
  saldoInklNebenkostenabrechnung: number;
  zeilen: MieterkontoZeile[];
  summe: { sollKaltmiete: number; sollNebenkosten: number; sollGesamt: number; betrag: number; differenz: number; saldo: number };
};

type Zahlung = {
  id: string;
  datum: Date;
  betrag: number;
  verwendungszweck: string | null;
  // Mietperiode, für die gezahlt wurde; fehlt sie, gilt ersatzweise der Monat des Buchungsdatums.
  periodeMonat?: number | null;
  periodeJahr?: number | null;
};
type Sonder = { id: string; datum: Date; betrag: number; verwendungszweck: string | null; istForderung: boolean };

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function imZeitraum(datum: Date, ab: Date | null, bis: Date): boolean {
  return (!ab || datum >= ab) && datum <= bis;
}

const monatsIndex = (jahr: number, monat: number) => jahr * 12 + monat;

/** Monatsindex der Mietperiode einer Zahlung (Jahr*12+Monat). */
function periodeIndex(z: Zahlung): number {
  return z.periodeJahr && z.periodeMonat
    ? monatsIndex(z.periodeJahr, z.periodeMonat)
    : monatsIndex(z.datum.getFullYear(), z.datum.getMonth() + 1);
}

/** Jahre, für die das Mieterkonto etwas zeigen kann (aufsteigend). */
export function verfuegbareKontoJahre(sollZeilen: SollZeile[], bis: Date): number[] {
  const erstes = sollZeilen.length > 0 ? sollZeilen[0].jahr : bis.getFullYear();
  const jahre: number[] = [];
  for (let j = erstes; j <= bis.getFullYear(); j++) jahre.push(j);
  return jahre;
}

export function baueMieterkontoJahr(input: {
  jahr: number;
  saldovortrag: number;
  sollZeilen: SollZeile[];
  zahlungen: Zahlung[];
  sonderBuchungen: Sonder[];
  ab: Date | null;
  bis: Date;
  nebenkostenabrechnungOffen?: number | null;
}): MieterkontoJahr {
  const { jahr } = input;
  // Zahlungen zählen nach ihrer Mietperiode: von der Periode des Stichtags `ab` bis zur Periode von
  // `bis` (eine im Voraus gezahlte Miete für einen späteren Monat gehört noch nicht dazu).
  const vonPeriode = input.ab ? monatsIndex(input.ab.getFullYear(), input.ab.getMonth() + 1) : -Infinity;
  const bisPeriode = monatsIndex(input.bis.getFullYear(), input.bis.getMonth() + 1);
  const zahlungen = input.zahlungen.filter((z) => {
    const p = periodeIndex(z);
    return p >= vonPeriode && p <= bisPeriode;
  });
  const sonder = input.sonderBuchungen.filter((s) => imZeitraum(s.datum, input.ab, input.bis));
  const jahresanfang = new Date(jahr, 0, 1);

  // Saldo-Übertrag: alles vor dem 1.1. des Berichtsjahres.
  let uebertrag = input.saldovortrag;
  for (const s of input.sollZeilen) if (s.jahr < jahr) uebertrag -= s.betrag;
  for (const z of zahlungen) if (periodeIndex(z) < monatsIndex(jahr, 1)) uebertrag += z.betrag;
  for (const s of sonder) if (s.datum < jahresanfang) uebertrag += s.istForderung ? -s.betrag : s.betrag;

  const zeilen: MieterkontoZeile[] = [];
  let saldo = uebertrag;
  const summe = { sollKaltmiete: 0, sollNebenkosten: 0, sollGesamt: 0, betrag: 0, differenz: 0, saldo: 0 };
  let letzteMiete = { kalt: 0, nk: 0 };

  const imMonat = <T extends { datum: Date }>(liste: T[], monat: number) =>
    liste.filter((e) => e.datum.getFullYear() === jahr && e.datum.getMonth() + 1 === monat).sort((a, b) => a.datum.getTime() - b.datum.getTime());
  const zahlungenImMonat = (monat: number) =>
    zahlungen.filter((z) => periodeIndex(z) === monatsIndex(jahr, monat)).sort((a, b) => a.datum.getTime() - b.datum.getTime());

  for (let monat = 1; monat <= 12; monat++) {
    const soll = input.sollZeilen.find((s) => s.jahr === jahr && s.monat === monat);
    const pays = zahlungenImMonat(monat);
    const sonders = imMonat(sonder, monat);
    if (!soll && pays.length === 0 && sonders.length === 0) continue;

    let erste = true;
    const monatLabel = () => {
      const label = erste ? MONATE[monat - 1] : "";
      erste = false;
      return label;
    };

    const sollKalt = soll ? soll.kaltmiete : null;
    const sollNk = soll ? soll.betrag - soll.kaltmiete : null;
    if (soll) {
      letzteMiete = { kalt: soll.kaltmiete, nk: soll.betrag - soll.kaltmiete };
      summe.sollKaltmiete += soll.kaltmiete;
      summe.sollNebenkosten += soll.betrag - soll.kaltmiete;
      summe.sollGesamt += soll.betrag;
    }

    // Zahlungen und Sonderbuchungen des Monats in einer gemeinsamen, nach Datum sortierten Reihe
    // (bei gleichem Datum: Zahlung, dann Gebühr, dann Zahlung auf Gebühren).
    type Ereignis =
      | { art: "zahlung"; datum: Date; z: Zahlung }
      | { art: "sonder"; datum: Date; s: Sonder };
    const rang = (e: Ereignis) => (e.art === "zahlung" ? 0 : e.s.istForderung ? 1 : 2);
    const ereignisse: Ereignis[] = [
      ...pays.map((z): Ereignis => ({ art: "zahlung", datum: z.datum, z })),
      ...sonders.map((s): Ereignis => ({ art: "sonder", datum: s.datum, s })),
    ].sort((a, b) => a.datum.getTime() - b.datum.getTime() || rang(a) - rang(b));

    const sollBetrag = soll?.betrag ?? 0;
    const ersteIstZahlung = ereignisse[0]?.art === "zahlung";

    // Soll-Zeile: mit der ersten Zahlung zusammen, wenn diese das erste Ereignis des Monats ist,
    // sonst allein (dann folgen Sonderbuchungen vor der ersten Zahlung).
    if (soll && !ersteIstZahlung) {
      saldo -= sollBetrag;
      zeilen.push({
        monat: monatLabel(), sollKaltmiete: sollKalt, sollNebenkosten: sollNk, sollGesamt: soll.betrag,
        buchungsart: "–", datum: null, betrag: null, differenz: -sollBetrag, saldo,
        bemerkung: pays.length === 0 ? "noch keine Zahlung" : "", sonderbuchung: false,
      });
      summe.differenz -= sollBetrag;
    }

    ereignisse.forEach((e, i) => {
      if (e.art === "zahlung") {
        const z = e.z;
        const mitSoll = i === 0 && !!soll;
        const differenz = z.betrag - (mitSoll ? sollBetrag : 0);
        saldo += differenz;
        zeilen.push({
          monat: monatLabel(),
          sollKaltmiete: mitSoll ? sollKalt : null, sollNebenkosten: mitSoll ? sollNk : null, sollGesamt: mitSoll ? soll!.betrag : null,
          buchungsart: "Mietzahlung", datum: z.datum, betrag: z.betrag, differenz, saldo,
          bemerkung: z.verwendungszweck ?? "", href: `/zahlungen/${z.id}`, sonderbuchung: false,
        });
        summe.betrag += z.betrag;
        summe.differenz += differenz;
      } else {
        const s = e.s;
        const differenz = s.istForderung ? -s.betrag : s.betrag;
        saldo += differenz;
        zeilen.push({
          monat: monatLabel(),
          sollKaltmiete: null, sollNebenkosten: null, sollGesamt: s.istForderung ? s.betrag : null,
          buchungsart: s.istForderung ? "Gebühr an Mieter" : "Gebühren-Zahlung", datum: s.datum, betrag: s.istForderung ? null : s.betrag,
          differenz, saldo, bemerkung: s.verwendungszweck ?? "", sonderbuchung: true,
        });
        if (s.istForderung) summe.sollGesamt += s.betrag;
        else summe.betrag += s.betrag;
        summe.differenz += differenz;
      }
    });
  }
  summe.saldo = saldo;

  return {
    jahr,
    uebertragVorjahr: uebertrag,
    sollKaltmieteMonatlich: letzteMiete.kalt,
    sollNebenkostenMonatlich: letzteMiete.nk,
    nebenkostenabrechnungOffen: input.nebenkostenabrechnungOffen ?? null,
    saldoInklNebenkostenabrechnung: saldo + (input.nebenkostenabrechnungOffen ?? 0),
    zeilen,
    summe,
  };
}
