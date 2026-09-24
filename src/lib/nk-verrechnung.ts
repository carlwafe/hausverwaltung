import type { Prisma } from "@/generated/prisma/client";

// Eine NK-Nachzahlung kann statt per Überweisung als Forderung aufs Mieterkonto verrechnet werden
// (Buchungsart MAHNGEBUEHR, positiver Betrag = der Mieter schuldet uns das). Damit die Position der
// Abrechnung dann nicht zusätzlich als "offene Nachzahlung" zählt, trägt diese Forderung
// bezugTyp = NK_VERRECHNUNG_BEZUG und jahr = Abrechnungsjahr (Verknüpfung über Mietvertrag+Jahr wie
// beim Nebenkostenausgleich, nicht über die bei "Neu berechnen" wechselnde Positions-ID).
export const NK_VERRECHNUNG_BEZUG = "Nebenkostenabrechnung";

// where-Teil: alle Buchungen, die eine NK-Abrechnung begleichen — echte Zahlungen (Ausgleich) und
// als Forderung verrechnete Nachzahlungen. Betrag jeweils mit "Bankvorzeichen" für den Vergleich
// mit dem Saldo: summe = −betrag.
export const NK_AUSGLEICH_ODER_VERRECHNUNG: Prisma.BuchungWhereInput = {
  OR: [
    { buchungsart: { code: "NEBENKOSTENAUSGLEICH" } },
    { buchungsart: { code: "MAHNGEBUEHR" }, bezugTyp: NK_VERRECHNUNG_BEZUG },
  ],
};
