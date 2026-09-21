// Mieterkonto pro Jahr (Kontokorrent des Mietvertrags): je Monat eine Zeile mit Soll und der/den
// Zahlung(en) dieses Monats, dazu Sonderbuchungen (Gebühren, Zahlungen darauf) als eigene Zeilen,
// mit laufendem Saldo und dem Saldo-Übertrag aus dem Vorjahr. Reine Darstellung — der Saldo folgt
// aus denselben Zahlen wie der Mietsaldo auf der Mietvertragsseite (Zahlungen ./. Soll +
// Saldovortrag ./. offene Sonderforderung), gespeichert wird nichts. Zahlungen stehen im Monat
// ihres Buchungsdatums (nicht der Mietperiode), damit der Jahresendsaldo exakt dem
// datumsbasierten Mietsaldo entspricht.
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
  zeilen: MieterkontoZeile[];
  summe: { sollKaltmiete: number; sollNebenkosten: number; sollGesamt: number; betrag: number; differenz: number; saldo: number };
};

type Zahlung = { id: string; datum: Date; betrag: number; verwendungszweck: string | null };
type Sonder = { id: string; datum: Date; betrag: number; verwendungszweck: string | null; istForderung: boolean };

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function imZeitraum(datum: Date, ab: Date | null, bis: Date): boolean {
  return (!ab || datum >= ab) && datum <= bis;
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
}): MieterkontoJahr {
  const { jahr } = input;
  const zahlungen = input.zahlungen.filter((z) => imZeitraum(z.datum, input.ab, input.bis));
  const sonder = input.sonderBuchungen.filter((s) => imZeitraum(s.datum, input.ab, input.bis));
  const jahresanfang = new Date(jahr, 0, 1);

  // Saldo-Übertrag: alles vor dem 1.1. des Berichtsjahres.
  let uebertrag = input.saldovortrag;
  for (const s of input.sollZeilen) if (s.jahr < jahr) uebertrag -= s.betrag;
  for (const z of zahlungen) if (z.datum < jahresanfang) uebertrag += z.betrag;
  for (const s of sonder) if (s.datum < jahresanfang) uebertrag += s.istForderung ? -s.betrag : s.betrag;

  const zeilen: MieterkontoZeile[] = [];
  let saldo = uebertrag;
  const summe = { sollKaltmiete: 0, sollNebenkosten: 0, sollGesamt: 0, betrag: 0, differenz: 0, saldo: 0 };
  let letzteMiete = { kalt: 0, nk: 0 };

  const imMonat = <T extends { datum: Date }>(liste: T[], monat: number) =>
    liste.filter((e) => e.datum.getFullYear() === jahr && e.datum.getMonth() + 1 === monat).sort((a, b) => a.datum.getTime() - b.datum.getTime());

  for (let monat = 1; monat <= 12; monat++) {
    const soll = input.sollZeilen.find((s) => s.jahr === jahr && s.monat === monat);
    const pays = imMonat(zahlungen, monat);
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

    if (pays.length === 0) {
      const differenz = -(soll?.betrag ?? 0);
      saldo += differenz;
      zeilen.push({
        monat: monatLabel(), sollKaltmiete: sollKalt, sollNebenkosten: sollNk, sollGesamt: soll?.betrag ?? null,
        buchungsart: "–", datum: null, betrag: null, differenz, saldo,
        bemerkung: soll ? "noch keine Zahlung" : "", sonderbuchung: false,
      });
      summe.differenz += differenz;
    }
    pays.forEach((z, i) => {
      const sollAnteil = i === 0 ? (soll?.betrag ?? 0) : 0;
      const differenz = z.betrag - sollAnteil;
      saldo += differenz;
      zeilen.push({
        monat: monatLabel(),
        sollKaltmiete: i === 0 ? sollKalt : null, sollNebenkosten: i === 0 ? sollNk : null, sollGesamt: i === 0 ? (soll?.betrag ?? null) : null,
        buchungsart: "Mietzahlung", datum: z.datum, betrag: z.betrag, differenz, saldo,
        bemerkung: z.verwendungszweck ?? "", href: `/zahlungen/${z.id}`, sonderbuchung: false,
      });
      summe.betrag += z.betrag;
      summe.differenz += differenz;
    });
    for (const s of sonders) {
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
  }
  summe.saldo = saldo;

  return {
    jahr,
    uebertragVorjahr: uebertrag,
    sollKaltmieteMonatlich: letzteMiete.kalt,
    sollNebenkostenMonatlich: letzteMiete.nk,
    zeilen,
    summe,
  };
}
