import type { Prisma } from "@/generated/prisma/client";

// Eine NK-Nachzahlung kann statt per Überweisung anders beglichen werden:
//  - als Forderung aufs Mieterkonto verrechnet (Buchungsart MAHNGEBUEHR, positiver Betrag = der
//    Mieter schuldet uns das): trägt bezugTyp = NK_VERRECHNUNG_BEZUG und jahr = Abrechnungsjahr;
//  - mit der Kaution verrechnet (Buchungsart KAUTION_EINBEHALT, negativer Betrag): die Buchung eines
//    KautionEinbehalt mit NK-Bezug trägt jahr = Abrechnungsjahr (bezugTyp "KautionEinbehalt").
// Die Verknüpfung läuft über Mietvertrag+Jahr (wie beim Nebenkostenausgleich), nicht über die bei
// "Neu berechnen" wechselnde Positions-ID.
export const NK_VERRECHNUNG_BEZUG = "Nebenkostenabrechnung";
export const KAUTION_EINBEHALT_BEZUG = "KautionEinbehalt";

// where-Teil: alle Buchungen, die eine NK-Abrechnung begleichen — echte Zahlungen (Ausgleich),
// als Forderung verrechnete Nachzahlungen und mit der Kaution verrechnete Einbehalte.
export const NK_AUSGLEICH_ODER_VERRECHNUNG: Prisma.BuchungWhereInput = {
  OR: [
    { buchungsart: { code: "NEBENKOSTENAUSGLEICH" } },
    { buchungsart: { code: "MAHNGEBUEHR" }, bezugTyp: NK_VERRECHNUNG_BEZUG },
    { buchungsart: { code: "KAUTION_EINBEHALT" }, bezugTyp: KAUTION_EINBEHALT_BEZUG, jahr: { not: null } },
  ],
};

// Beitrag einer solchen Buchung zur Begleichung, im selben Vorzeichen wie der Saldo der Position
// (Nachzahlung negativ): eine eingehende Zahlung/Forderung (positiver Betrag) begleicht eine
// Nachzahlung → negativ; ein Kaution-Einbehalt ist selbst schon negativ gebucht und zählt wie eine
// vom Mieter geleistete Zahlung in derselben Höhe.
export function nkBegleichung(code: string, betrag: number): number {
  return code === "KAUTION_EINBEHALT" ? betrag : -betrag;
}
