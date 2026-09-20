// Mieterkonto: die Bestandteile des Mietsaldos (Saldovortrag, monatliches Soll, Mietzahlungen,
// Sonderforderungen und Zahlungen darauf) als eine chronologische Kontoführung mit laufendem
// Saldo. Reine Darstellung — der Endsaldo ergibt sich aus denselben Zahlen wie der Saldo auf der
// Mietvertragsseite (Zahlungen ./. Soll + Saldovortrag ./. offene Sonderforderung), es wird
// nichts gespeichert.
import type { SollZeile } from "./soll-ist";

export type MieterkontoArt = "vortrag" | "soll" | "zahlung" | "gebuehr" | "gebuehrzahlung";

export type MieterkontoZeile = {
  datum: Date | null;
  art: MieterkontoArt;
  text: string;
  // Wirkung auf den Saldo: negativ = Forderung/Soll (Rückstand wächst), positiv = Zahlung.
  betrag: number;
  saldo: number;
  href?: string;
};

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
// Bei gleichem Datum: erst Soll/Forderungen, dann Zahlungen.
const REIHENFOLGE: Record<MieterkontoArt, number> = { vortrag: 0, soll: 1, gebuehr: 2, zahlung: 3, gebuehrzahlung: 4 };

function imZeitraum(datum: Date, ab: Date | null, bis: Date): boolean {
  return (!ab || datum >= ab) && datum <= bis;
}

export function baueMieterkonto(input: {
  saldovortrag: number;
  sollZeilen: SollZeile[];
  zahlungen: { id: string; datum: Date; betrag: number; verwendungszweck: string | null }[];
  sonderBuchungen: { id: string; datum: Date; betrag: number; verwendungszweck: string | null; istForderung: boolean }[];
  ab: Date | null;
  bis: Date;
}): MieterkontoZeile[] {
  const zeilen: Omit<MieterkontoZeile, "saldo">[] = [];

  for (const s of input.sollZeilen) {
    zeilen.push({
      datum: s.faelligAm,
      art: "soll",
      text: `Soll ${MONATE[s.monat - 1]} ${s.jahr} (Kaltmiete + Nebenkosten)`,
      betrag: -s.betrag,
    });
  }
  for (const z of input.zahlungen) {
    if (!imZeitraum(z.datum, input.ab, input.bis)) continue;
    zeilen.push({
      datum: z.datum,
      art: "zahlung",
      text: z.verwendungszweck || "Mietzahlung",
      betrag: z.betrag,
      href: `/zahlungen/${z.id}`,
    });
  }
  for (const b of input.sonderBuchungen) {
    if (!imZeitraum(b.datum, input.ab, input.bis)) continue;
    zeilen.push({
      datum: b.datum,
      art: b.istForderung ? "gebuehr" : "gebuehrzahlung",
      text: b.verwendungszweck || (b.istForderung ? "Gebühr" : "Zahlung auf Gebühren"),
      betrag: b.istForderung ? -b.betrag : b.betrag,
    });
  }

  zeilen.sort(
    (a, b) => a.datum!.getTime() - b.datum!.getTime() || REIHENFOLGE[a.art] - REIHENFOLGE[b.art],
  );

  let saldo = input.saldovortrag;
  const ergebnis: MieterkontoZeile[] = [
    { datum: null, art: "vortrag", text: "Saldovortrag", betrag: input.saldovortrag, saldo },
  ];
  for (const z of zeilen) {
    saldo += z.betrag;
    ergebnis.push({ ...z, saldo });
  }
  return ergebnis;
}
