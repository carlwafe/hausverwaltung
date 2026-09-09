import { berechneSoll, berechneIst, type MietvertragFuerSollIst } from "./soll-ist";

export type MietvertragFuerJahresbericht = MietvertragFuerSollIst & {
  id: string;
  saldovortrag: number;
  einheitBezeichnung: string;
  mieterNamen: string;
  zahlungen: { datum: Date; betrag: number }[];
  beglicheneNebenkostenPositionen: { beglichenAm: Date; beglichenBetrag: number }[];
};

export type MieterJahresberichtZeile = {
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  saldoAlt: number;
  soll: number;
  miete: number;
  abrechnung: number;
  saldoNeu: number;
};

/**
 * Saldo (wie bei Offene Posten: ist - soll + saldovortrag) zu einem beliebigen Stichtag —
 * dieselbe Formel, nur zweimal aufgerufen (Jahresanfang/-ende) statt einmal, um die
 * Jahresbewegung als Differenz zu zeigen.
 */
function saldoZuStichtag(v: MietvertragFuerJahresbericht, bis: Date, buchhaltungAb: Date | null): number {
  const soll = berechneSoll(v, bis, buchhaltungAb);
  const ist = berechneIst(v.zahlungen, buchhaltungAb, bis);
  return ist - soll + v.saldovortrag;
}

/**
 * Pro-Mietvertrag-Aufschlüsselung für den Jahresbericht: Saldo alt (1.1.), die Bewegungen des
 * Jahres (Soll, tatsächlich gezahlte Miete, Nebenkostenabrechnungs-Ausgleich) und Saldo neu
 * (31.12. bzw. `buchhaltungBis`, falls das Jahr noch nicht vollständig erfasst ist) — rechnet
 * sich lückenlos zusammen: saldoNeu = saldoAlt - soll + miete + abrechnung.
 *
 * Nur Mietverträge, die für das Jahr tatsächlich relevant sind (Bewegung oder Saldo ungleich
 * null), werden zurückgegeben — ein Vertrag ohne jede Berührung mit dem Jahr taucht nicht auf.
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
    const saldoNeu = saldoZuStichtag(v, saldoNeuBis, buchhaltungAb);
    const soll = berechneSoll(v, saldoNeuBis, buchhaltungAb) - berechneSoll(v, saldoAltBis, buchhaltungAb);
    const miete = v.zahlungen
      .filter((z) => z.datum >= jahresanfang && z.datum < jahresendeExklusiv && z.datum <= saldoNeuBis)
      .reduce((sum, z) => sum + z.betrag, 0);
    // Vorzeichen umgedreht gegenüber beglichenBetrag (positiv=Guthaben ausgezahlt): hier eine
    // Nachzahlung als Einnahme(+), eine Guthaben-Auszahlung als Ausgabe(-) an den Mieter.
    const abrechnung = v.beglicheneNebenkostenPositionen
      .filter((p) => p.beglichenAm >= jahresanfang && p.beglichenAm < jahresendeExklusiv)
      .reduce((sum, p) => sum - p.beglichenBetrag, 0);

    if (saldoAlt === 0 && soll === 0 && miete === 0 && abrechnung === 0 && saldoNeu === 0) continue;

    zeilen.push({
      mietvertragId: v.id,
      einheitBezeichnung: v.einheitBezeichnung,
      mieterNamen: v.mieterNamen,
      saldoAlt,
      soll,
      miete,
      abrechnung,
      saldoNeu,
    });
  }

  return zeilen.sort((a, b) => a.einheitBezeichnung.localeCompare(b.einheitBezeichnung, "de"));
}
