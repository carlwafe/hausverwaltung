// Zentrale Abfrage-Helfer auf dem Buchungsjournal — ersetzt die fünf getrennten Ladefunktionen
// (Zahlung/Kostenposition/EigentuemerBuchung/KautionBuchung/NebenkostenausgleichZahlung) des
// Vorgänger-Modells. Jeder Report ist hier ein Filter/Group-By auf eine einzige Tabelle statt
// mehrerer von Hand zusammengeführter Promise.all-Aufrufe.
import { prisma } from "@/lib/prisma";
import { berechneKontostandVerlauf, type KontostandEintrag, type KontostandZeile } from "@/lib/kontostand";

// Kostenposition-artige Buchungen behalten die alte Vorzeichenkonvention (positiv = echte
// Ausgabe, negativ = Gutschrift) — für eine Kontostand-Sicht (positiv = eingehend) muss das
// Vorzeichen gedreht werden, exakt wie im Vorgänger-Modell (kontostand/page.tsx: betrag: -k.betrag).
const KOSTEN_BUCHUNGSARTEN = new Set(["KOSTENPOSITION"]);

/**
 * Alle zahlungswirksamen Buchungen (buchungsart.zahlungswirksam = true) als rohe
 * Kontostand-Einträge, ohne Anker-Bezug — Grundlage sowohl für ladeKontostandVerlauf
 * (kontostand/page.tsx) als auch für den Kontenabgleich auf jahresuebersicht/page.tsx, der den
 * Kontostand an zwei beliebigen Stichtagen (Jahresanfang/-ende) braucht, nicht den vollen Verlauf.
 */
export async function ladeKontostandEintraege(): Promise<KontostandEintrag[]> {
  const buchungen = await prisma.buchung.findMany({
    where: { buchungsart: { zahlungswirksam: true } },
    select: {
      id: true,
      datum: true,
      betrag: true,
      empfaenger: true,
      verwendungszweck: true,
      buchungsart: { select: { code: true, kontokreis: true } },
    },
  });

  // Beim Import "als nicht kategorisiert" geparkte Buchungen sind echte Kontobewegungen (Rohbetrag
  // mit Bankvorzeichen), nur ohne fachliche Zuordnung — sie müssen den Kontostand trotzdem
  // mitbewegen, sonst weicht er vom echten Kontoauszug ab.
  const nichtKategorisiert = await prisma.nichtZugeordneteBuchung.findMany({
    select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true },
  });

  const geparkt: KontostandEintrag[] = nichtKategorisiert.map((n) => ({
    id: n.id,
    datum: n.datum,
    betrag: Number(n.betrag),
    kategorie: "nicht_kategorisiert" as const,
    beschreibung: n.empfaenger || n.verwendungszweck || "Nicht kategorisierte Buchung",
  }));

  const journal: KontostandEintrag[] = buchungen
    .filter((b) => b.datum !== null)
    .map((b) => {
      const rohBetrag = Number(b.betrag);
      const betrag = KOSTEN_BUCHUNGSARTEN.has(b.buchungsart.code) ? -rohBetrag : rohBetrag;
      const kategorie =
        b.buchungsart.code === "MIETZAHLUNG"
          ? ("zahlung" as const)
          : KOSTEN_BUCHUNGSARTEN.has(b.buchungsart.code)
            ? ("kosten" as const)
            : b.buchungsart.code === "MIETWEITERLEITUNG"
              ? ("mietweiterleitung" as const)
              : b.buchungsart.kontokreis === "KAUTIONSKONTO"
                ? ("kaution" as const)
                : ("sonstige" as const);
      return {
        id: b.id,
        datum: b.datum!,
        betrag,
        kategorie,
        beschreibung: b.empfaenger || b.verwendungszweck || "Buchung",
      };
    });

  return [...journal, ...geparkt];
}

/**
 * Ersetzt die 5 getrennten findMany-Aufrufe in kontostand/page.tsx.
 */
export async function ladeKontostandVerlauf(anker: { datum: Date; betrag: number }): Promise<KontostandZeile[]> {
  const eintraege = await ladeKontostandEintraege();
  return berechneKontostandVerlauf(eintraege, anker);
}

/**
 * Ist-Summe (tatsächlich gezahlte Miete) für einen Mietvertrag im Zeitraum [von, bis] — ersetzt
 * berechneIst(Zahlung[]) aus soll-ist.ts. Soll bleibt unverändert eine reine Berechnung aus
 * Mietvertrag/Mieterhoehung, nicht Teil des Journals.
 */
export async function berechneIstAusBuchung(
  mietvertragId: string,
  buchhaltungAb: Date | null,
  buchhaltungBis: Date | null,
): Promise<number> {
  const result = await prisma.buchung.aggregate({
    where: {
      mietvertragId,
      buchungsart: { code: "MIETZAHLUNG" },
      ...(buchhaltungAb || buchhaltungBis
        ? { datum: { ...(buchhaltungAb ? { gte: buchhaltungAb } : {}), ...(buchhaltungBis ? { lte: buchhaltungBis } : {}) } }
        : {}),
    },
    _sum: { betrag: true },
  });
  return Number(result._sum.betrag ?? 0);
}
