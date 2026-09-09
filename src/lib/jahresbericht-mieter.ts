import { berechneSoll, berechneIst, type MietvertragFuerSollIst } from "./soll-ist";

export type MietvertragFuerJahresbericht = MietvertragFuerSollIst & {
  id: string;
  saldovortrag: number;
  einheitBezeichnung: string;
  mieterNamen: string;
  zahlungen: { datum: Date; betrag: number }[];
  // Alle Nebenkostenabrechnung-Positionen dieses Mietvertrags, unabhängig vom Abrechnungsjahr —
  // für "Nebenkostenabrechnung offen" wird der aktuelle Gesamtstand über alle Jahre gebraucht,
  // nicht nur die Bewegung des Berichtsjahres.
  nebenkostenPositionen: { saldo: number; beglichenBetrag: number | null }[];
};

export type MieterJahresberichtZeile = {
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  saldoAlt: number;
  soll: number;
  miete: number;
  saldoNeu: number;
  // null = keine einzige Nebenkostenabrechnung-Position für diesen Mietvertrag vorhanden
  // (unterscheidet sich in der Anzeige bewusst nicht von "0" — beides zeigt "–", da ein
  // bestätigter Nullsaldo von "nie erfasst" ohnehin nicht unterscheidbar wäre).
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

/** positiv = noch offenes Guthaben (Vermieter schuldet Mieter), negativ = noch offene Nachzahlung. */
function nebenkostenabrechnungOffenBetrag(v: MietvertragFuerJahresbericht): number | null {
  if (v.nebenkostenPositionen.length === 0) return null;
  return v.nebenkostenPositionen.reduce((sum, p) => sum + (p.saldo - (p.beglichenBetrag ?? 0)), 0);
}

/**
 * Pro-Mietvertrag-Aufschlüsselung für den Jahresbericht: Saldo alt (1.1.), die Bewegungen des
 * Jahres (Soll, tatsächlich gezahlte Miete) und Saldo neu (31.12. bzw. `buchhaltungBis`, falls
 * das Jahr noch nicht vollständig erfasst ist) — rechnet sich lückenlos zusammen: saldoNeu =
 * saldoAlt - soll + miete. Daneben, informativ und unabhängig von dieser Rechnung, der aktuelle
 * offene Nebenkostenabrechnung-Saldo (siehe nebenkostenabrechnungOffenBetrag).
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
    const saldoNeu = saldoZuStichtag(v, saldoNeuBis, buchhaltungAb);
    const soll = berechneSoll(v, saldoNeuBis, buchhaltungAb) - berechneSoll(v, saldoAltBis, buchhaltungAb);
    const miete = v.zahlungen
      .filter((z) => z.datum >= jahresanfang && z.datum < jahresendeExklusiv && z.datum <= saldoNeuBis)
      .reduce((sum, z) => sum + z.betrag, 0);
    const nebenkostenabrechnungOffen = nebenkostenabrechnungOffenBetrag(v);

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
