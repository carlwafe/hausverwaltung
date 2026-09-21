import { berechneSoll, berechneSollKaltmiete, ermittleMieteFuerMonat, type MietvertragFuerSollIst } from "./soll-ist";

export type MietvertragFuerJahresbericht = MietvertragFuerSollIst & {
  id: string;
  saldovortrag: number;
  einheitBezeichnung: string;
  mieterNamen: string;
  // periodeMonat/periodeJahr statt Buchungsdatum: der Jahresbericht rechnet bewusst danach, für
  // welchen Zeitraum eine Zahlung gedacht ist, nicht danach, wann sie auf dem Konto einging (siehe
  // saldoZuStichtag) — eine Miete, die z.B. Ende Dezember schon für den Januar des Folgejahres
  // überwiesen wird, soll den Saldo des laufenden Jahres nicht künstlich ins Plus ziehen.
  zahlungen: { periodeMonat: number; periodeJahr: number; betrag: number }[];
  // Sonderforderungen (Gebühren) und Zahlungen darauf, nach Buchungsdatum — betrag ist die Wirkung
  // auf den Saldo (negativ = Gebühr an den Mieter, positiv = Zahlung darauf). Fließt wie beim
  // Mieterkonto und den Offenen Posten in den Saldo ein, damit alle drei denselben Saldo zeigen.
  sonderbewegungen: { datum: Date; betrag: number }[];
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
  // Monatliche Sollwerte, wie sie im letzten Berichtsmonat gelten (nach Mieterhöhungen; bei einem
  // im Jahr beendeten Vertrag im Monat des Mietendes). nebenkostenMtl enthält wie sollNebenkosten
  // ggf. die Mehrwertsteuer bei Garagen.
  kaltmieteMtl: number;
  nebenkostenMtl: number;
  warmMtl: number;
  sollKaltmiete: number;
  // Nebenkosten-Anteil von soll (inkl. ggf. Mehrwertsteuer bei Garagen) — soll - sollKaltmiete,
  // damit die Summe beider Spalten immer exakt soll ergibt.
  sollNebenkosten: number;
  miete: number;
  saldoNeu: number;
  // null = keine Nebenkostenabrechnung-Position fürs Vorjahr vorhanden (unterscheidet sich in der
  // Anzeige bewusst nicht von "0" — beides zeigt "–", da ein bestätigter Nullsaldo von "nie
  // erfasst" ohnehin nicht unterscheidbar wäre).
  nebenkostenabrechnungOffen: number | null;
};

/** Jahr+Monat als einzelne, vergleichbare Zahl (z.B. 2025-03 -> 2025*12+3). */
function periodeVon(datum: Date): number {
  return datum.getFullYear() * 12 + (datum.getMonth() + 1);
}

/**
 * Summe der Zahlungen, deren zugeordnete Periode (periodeJahr/periodeMonat) im Bereich
 * [vonPeriode, bisPeriode] liegt — das Gegenstück zu berechneIst (soll-ist.ts), das stattdessen
 * nach dem tatsächlichen Buchungsdatum filtert. Andere Seiten (Offene Posten, Dashboard,
 * Mietvertrag-Detail) verwenden bewusst weiter das Buchungsdatum, da dort der tatsächliche
 * Kontostand zählt — nur der Jahresbericht bildet hier absichtlich ab, wofür eine Zahlung gedacht
 * war, nicht wann sie einging.
 */
function istNachZuordnung(
  zahlungen: MietvertragFuerJahresbericht["zahlungen"],
  vonPeriode: number,
  bisPeriode: number,
): number {
  return zahlungen
    .filter((z) => {
      const periode = z.periodeJahr * 12 + z.periodeMonat;
      return periode >= vonPeriode && periode <= bisPeriode;
    })
    .reduce((sum, z) => sum + z.betrag, 0);
}

/**
 * Saldo (wie bei Offene Posten: ist - soll + saldovortrag) zu einem beliebigen Stichtag —
 * dieselbe Formel, nur zweimal aufgerufen (Jahresanfang/-ende) statt einmal, um die
 * Jahresbewegung als Differenz zu zeigen. Bewusst ohne jeden Bezug zur
 * Nebenkostenabrechnung — das ist eine eigene Abrechnungsperiode (meist das Vorjahr) mit eigener
 * Zahlungslogik, kein Bestandteil der laufenden Miet-Saldo-Fortschreibung.
 */
function saldoZuStichtag(v: MietvertragFuerJahresbericht, bis: Date, buchhaltungAb: Date | null): number {
  const soll = berechneSoll(v, bis, buchhaltungAb);
  const ist = istNachZuordnung(v.zahlungen, buchhaltungAb ? periodeVon(buchhaltungAb) : -Infinity, periodeVon(bis));
  const sonder = v.sonderbewegungen
    .filter((s) => (!buchhaltungAb || s.datum >= buchhaltungAb) && s.datum <= bis)
    .reduce((sum, s) => sum + s.betrag, 0);
  return ist - soll + v.saldovortrag + sonder;
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
 * "Miete" sowie das Ist in Saldo alt/neu zählen nach der zugeordneten Periode (periodeMonat/
 * periodeJahr), nicht nach dem tatsächlichen Buchungsdatum (siehe istNachZuordnung) — eine Ende
 * Dezember bereits für den Januar des Folgejahres eingegangene Miete zählt so korrekt zum
 * Folgejahr statt das laufende Jahr künstlich ins Plus zu ziehen.
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
  const saldoNeuBisPeriode = periodeVon(saldoNeuBis);

  const zeilen: MieterJahresberichtZeile[] = [];

  for (const v of vertraege) {
    const saldoAlt = saldoZuStichtag(v, saldoAltBis, buchhaltungAb);
    const soll = berechneSoll(v, saldoNeuBis, buchhaltungAb) - berechneSoll(v, saldoAltBis, buchhaltungAb);
    const sollKaltmiete =
      berechneSollKaltmiete(v, saldoNeuBis, buchhaltungAb) - berechneSollKaltmiete(v, saldoAltBis, buchhaltungAb);
    const sollNebenkosten = soll - sollKaltmiete;
    const letzterMonat = v.ende && v.ende < saldoNeuBis ? v.ende : saldoNeuBis;
    const mtl = ermittleMieteFuerMonat(v, letzterMonat.getFullYear(), letzterMonat.getMonth() + 1);
    const kaltmieteMtl = mtl.kaltmiete;
    const nebenkostenMtl = mtl.nebenkostenVorauszahlung + (v.mehrwertsteuer ?? 0);
    const miete = v.zahlungen
      .filter((z) => z.periodeJahr === jahr && z.periodeJahr * 12 + z.periodeMonat <= saldoNeuBisPeriode)
      .reduce((sum, z) => sum + z.betrag, 0);
    const nebenkostenabrechnungOffen = nebenkostenabrechnungOffenBetrag(v, jahr);
    // Inklusive der offenen Nebenkostenabrechnung des Vorjahres — im Mieterkonto steht dieselbe Zahl
    // als "Saldo inkl. offener Nebenkostenabrechnung" unter der Jahressumme.
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
      kaltmieteMtl,
      nebenkostenMtl,
      warmMtl: kaltmieteMtl + nebenkostenMtl,
      sollKaltmiete,
      sollNebenkosten,
      miete,
      saldoNeu,
      nebenkostenabrechnungOffen,
    });
  }

  return zeilen.sort((a, b) => a.einheitBezeichnung.localeCompare(b.einheitBezeichnung, "de"));
}
