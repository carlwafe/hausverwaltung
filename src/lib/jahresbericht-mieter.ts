import { berechneSoll, berechneIst, type MietvertragFuerSollIst } from "./soll-ist";

export type MietvertragFuerJahresbericht = MietvertragFuerSollIst & {
  id: string;
  saldovortrag: number;
  einheitBezeichnung: string;
  mieterNamen: string;
  zahlungen: { datum: Date; betrag: number }[];
  // Alle Nebenkostenabrechnung-Positionen dieses Mietvertrags, unabhängig vom Berichtsjahr — für
  // "Nebenkostenabrechnung offen (Vorjahr)" wird gezielt die Position des Vorjahres der jeweiligen
  // Abrechnung herausgesucht (siehe nebenkostenabrechnungOffenBetrag), nicht die Bewegung des
  // Berichtsjahres selbst. zahlungSumme = tatsächlich gezahlte/erhaltene Summe für
  // Mietvertrag+Jahr aus dem Nebenkostenausgleich-Archiv (0 = noch nichts erfasst).
  nebenkostenPositionen: { jahr: number; saldo: number; zahlungSumme: number }[];
};

export type MieterJahresberichtZeile = {
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  saldoAlt: number;
  soll: number;
  miete: number;
  saldoNeu: number;
  // null = keine Nebenkostenabrechnung-Position fürs Vorjahr vorhanden (unterscheidet sich in der
  // Anzeige bewusst nicht von "0" — beides zeigt "–", da ein bestätigter Nullsaldo von "nie
  // erfasst" ohnehin nicht unterscheidbar wäre).
  nebenkostenabrechnungOffen: number | null;
};

/**
 * Saldo (wie bei Offene Posten: ist - soll + saldovortrag) zu einem beliebigen Stichtag —
 * dieselbe Formel, nur zweimal aufgerufen (Jahresanfang/-ende) statt einmal, um die
 * Jahresbewegung als Differenz zu zeigen. Bewusst ohne jeden Bezug zur
 * Nebenkostenabrechnung — das ist eine eigene Abrechnungsperiode (meist das Vorjahr) mit eigener
 * Zahlungslogik, kein Bestandteil der laufenden Miet-Saldo-Fortschreibung.
 */
function saldoZuStichtag(v: MietvertragFuerJahresbericht, bis: Date, buchhaltungAb: Date | null): number {
  const soll = berechneSoll(v, bis, buchhaltungAb);
  const ist = berechneIst(v.zahlungen, buchhaltungAb, bis);
  return ist - soll + v.saldovortrag;
}

/**
 * positiv = noch offenes Guthaben (Vermieter schuldet Mieter), negativ = noch offene Nachzahlung —
 * bewusst nur für das Vorjahr des Berichtsjahres (z.B. im Jahresbericht 2025 nur die
 * 2024er-Abrechnung): eine Nebenkostenabrechnung wird typischerweise erst im Folgejahr beglichen,
 * gehört inhaltlich also in den Jahresbericht des Jahres, in dem die Zahlung tatsächlich erwartet
 * wird. Ältere, noch offene Jahre fließen hier bewusst nicht mehr mit ein (die vollständige
 * Historie bleibt über /nebenkostenabrechnungen einsehbar).
 */
function nebenkostenabrechnungOffenBetrag(v: MietvertragFuerJahresbericht, jahr: number): number | null {
  const vorjahresPosition = v.nebenkostenPositionen.find((p) => p.jahr === jahr - 1);
  if (!vorjahresPosition) return null;
  return vorjahresPosition.saldo - vorjahresPosition.zahlungSumme;
}

/**
 * Pro-Mietvertrag-Aufschlüsselung für den Jahresbericht: Saldo alt (1.1.), die Bewegungen des
 * Jahres (Soll, tatsächlich gezahlte Miete) und Saldo neu (31.12. bzw. `buchhaltungBis`, falls
 * das Jahr noch nicht vollständig erfasst ist) — Saldo neu = Saldo alt - Soll + Miete +
 * Nebenkostenabrechnung offen (Vorjahr). Der offene Vorjahres-NK-Saldo (siehe
 * nebenkostenabrechnungOffenBetrag) fließt bewusst nur in Saldo neu ein, nicht in Saldo alt — die
 * Vorjahresabrechnung entsteht/wird beglichen typischerweise erst im Laufe des Berichtsjahres,
 * war zu dessen Beginn also noch kein Bestandteil des Saldos.
 *
 * Nur Mietverträge, die für das Jahr oder den offenen Nebenkostenabrechnung-Saldo tatsächlich
 * relevant sind, werden zurückgegeben — ein Vertrag ohne jede Bewegung/Saldo taucht nicht auf.
 */
export function berechneMieterJahresbericht(
  vertraege: MietvertragFuerJahresbericht[],
  jahr: number,
  buchhaltungAb: Date | null,
  buchhaltungBisGlobal: Date | null,
): MieterJahresberichtZeile[] {
  const saldoAltBis = new Date(jahr - 1, 11, 31, 23, 59, 59, 999);
  const saldoNeuBisKandidat = new Date(jahr, 11, 31, 23, 59, 59, 999);
  const saldoNeuBis =
    buchhaltungBisGlobal && buchhaltungBisGlobal < saldoNeuBisKandidat
      ? buchhaltungBisGlobal
      : saldoNeuBisKandidat;
  const jahresanfang = new Date(jahr, 0, 1);
  const jahresendeExklusiv = new Date(jahr + 1, 0, 1);

  const zeilen: MieterJahresberichtZeile[] = [];

  for (const v of vertraege) {
    const saldoAlt = saldoZuStichtag(v, saldoAltBis, buchhaltungAb);
    const soll = berechneSoll(v, saldoNeuBis, buchhaltungAb) - berechneSoll(v, saldoAltBis, buchhaltungAb);
    const miete = v.zahlungen
      .filter((z) => z.datum >= jahresanfang && z.datum < jahresendeExklusiv && z.datum <= saldoNeuBis)
      .reduce((sum, z) => sum + z.betrag, 0);
    const nebenkostenabrechnungOffen = nebenkostenabrechnungOffenBetrag(v, jahr);
    const saldoNeu = saldoZuStichtag(v, saldoNeuBis, buchhaltungAb) + (nebenkostenabrechnungOffen ?? 0);

    if (
      saldoAlt === 0 &&
      soll === 0 &&
      miete === 0 &&
      saldoNeu === 0 &&
      !nebenkostenabrechnungOffen
    ) {
      continue;
    }

    zeilen.push({
      mietvertragId: v.id,
      einheitBezeichnung: v.einheitBezeichnung,
      mieterNamen: v.mieterNamen,
      saldoAlt,
      soll,
      miete,
      saldoNeu,
      nebenkostenabrechnungOffen,
    });
  }

  return zeilen.sort((a, b) => a.einheitBezeichnung.localeCompare(b.einheitBezeichnung, "de"));
}
