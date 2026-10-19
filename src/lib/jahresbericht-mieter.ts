import { gegenrechnungBis, saldoMitToleranz } from "./nk-saldo";
import { berechneSoll, berechneSollKaltmiete, ermittleMieteFuerMonat, type MietvertragFuerSollIst } from "./soll-ist";

export type MietvertragFuerJahresbericht = MietvertragFuerSollIst & {
  id: string;
  // Wirksamer Buchhaltungs-Stichtag dieses Vertrags (effektiverStichtag: eigener, sonst der des Objekts;
  // null = keiner, dann zählt der Mietbeginn). Soll, Ist, Sonderbewegungen und Saldovortrag gelten ab hier.
  buchhaltungAb: Date | null;
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
  // unbezahlteVorauszahlung = Gegenrechnung bei berechneten Positionen (siehe unbezahlteNkVorauszahlung
  // in nk-saldo.ts): NK-Soll, das schon als Rückstand im Mietsaldo steht, aber in der Abrechnung nicht
  // als gezahlt zählt. Fehlt sie (manuelle Positionen), gilt 0. versendetAm = Versanddatum der Abrechnung:
  // berechnete Positionen nicht versendeter Abrechnungen gehören nicht in die Liste (weder Abrechnung noch
  // Gegenrechnung zählen), die Gegenrechnung gilt ab diesem Datum; manuelle Positionen haben keines.
  nebenkostenPositionen: {
    jahr: number;
    saldo: number;
    zahlungSumme: number;
    unbezahlteVorauszahlung?: number;
    versendetAm?: Date | null;
  }[];
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
  // Gutschrift der unbezahlten NK-Vorauszahlung (steht schon im Mietrückstand, siehe unbezahlteNkVorauszahlung)
  // von Abrechnungen, die im Zeitraum versendet wurden; sie ist schon in saldoNeu enthalten (danach in saldoAlt),
  // nebenkostenabrechnungOffen enthält sie nicht. 0 = keine.
  nebenkostenGegenrechnung: number;
};

/**
 * Sonderbewegungen (Gebühren-Forderungen, Zahlungen darauf, Verrechnungen mit Kaution/NK) je Vertrag im
 * Zeitraum, getrennt nach Forderung (`gefordert`, positiv = der Mieter schuldet das) und Gutschrift
 * (`gezahlt`, Zahlung oder Verrechnung). Gleiche Abgrenzung wie `saldoZuStichtag`/`berechneMieterBericht`
 * (Stichtag je Vertrag, Ende gekappt auf `buchhaltungBisGlobal`), damit
 * Saldo neu = Saldo alt − Soll + Miete − gefordert + gezahlt + Gutschrift NK-Vorauszahlung + NK offen aufgeht.
 * Eigene Funktion statt Feld in `MieterJahresberichtZeile`, damit sich deren JSON-Ausgabe nicht ändert.
 */
export function berechneMieterSonderbewegungen(
  vertraege: MietvertragFuerJahresbericht[],
  zeitraum: { von: Date; bis: Date },
  buchhaltungBisGlobal: Date | null,
): Map<string, { gefordert: number; gezahlt: number }> {
  const altBis = new Date(zeitraum.von.getTime() - 1);
  const neuBis = buchhaltungBisGlobal && buchhaltungBisGlobal < zeitraum.bis ? buchhaltungBisGlobal : zeitraum.bis;
  const ergebnis = new Map<string, { gefordert: number; gezahlt: number }>();
  for (const v of vertraege) {
    let gefordert = 0;
    let gezahlt = 0;
    for (const s of v.sonderbewegungen) {
      if (v.buchhaltungAb && s.datum < v.buchhaltungAb) continue;
      if (s.datum <= altBis || s.datum > neuBis) continue;
      if (s.betrag < 0) gefordert -= s.betrag;
      else gezahlt += s.betrag;
    }
    ergebnis.set(v.id, { gefordert: Math.round(gefordert * 100) / 100, gezahlt: Math.round(gezahlt * 100) / 100 });
  }
  return ergebnis;
}

/**
 * Abrechnung und Ausgleich der Nebenkostenabrechnung des Vorjahres je Vertrag, beide im Vorzeichen des
 * Mietsaldos (negativ = der Mieter schuldet): `abrechnung` = Saldo der Position (Guthaben +, Nachzahlung −),
 * `ausgleich` = bisher gebuchte Auszahlung/Zahlung/Verrechnung dazu mit umgekehrtem Vorzeichen (ausgezahltes
 * Guthaben −, gezahlte Nachzahlung +). Abrechnung + Ausgleich = „NK-Abrechnung offen“ (bis auf die Toleranz von
 * 1 Cent). Gleiche Auswahl wie `nebenkostenabrechnungOffenBetrag` (Position von jahr−1, erst ab Versand); wie
 * dort zählt der Ausgleich alles, was bisher gebucht ist, nicht nur den Berichtszeitraum. Eigene Funktion statt
 * Feldern in `MieterJahresberichtZeile`, damit sich deren JSON-Ausgabe nicht ändert.
 */
export function berechneMieterNkAusgleich(
  vertraege: MietvertragFuerJahresbericht[],
  jahr: number,
  bis: Date,
): Map<string, { abrechnung: number; ausgleich: number }> {
  const ergebnis = new Map<string, { abrechnung: number; ausgleich: number }>();
  for (const v of vertraege) {
    const p = v.nebenkostenPositionen.find((x) => x.jahr === jahr - 1);
    if (!p) continue;
    if (p.versendetAm && p.versendetAm > bis) continue;
    ergebnis.set(v.id, {
      abrechnung: Math.round(p.saldo * 100) / 100 || 0,
      ausgleich: Math.round(-p.zahlungSumme * 100) / 100 || 0,
    });
  }
  return ergebnis;
}

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
 * Nebenkostenabrechnung selbst — das ist eine eigene Abrechnungsperiode (meist das Vorjahr) mit eigener
 * Zahlungslogik, kein Bestandteil der laufenden Miet-Saldo-Fortschreibung. Ausnahme: die Gegenrechnung der
 * unbezahlten NK-Vorauszahlung versendeter Abrechnungen (Versanddatum ≤ Stichtag): nach dem Versand nicht mehr
 * geschuldet, gehört sie ab diesem Datum zum Saldo (im Zeitraum des Versands als Spalte „Gutschrift“ sichtbar,
 * danach in Saldo alt). Nachzahlung/Guthaben der Abrechnung des Vorjahres kommt als Spalte „Nebenkostenabrechnung
 * offen“ dazu.
 */
function saldoZuStichtag(v: MietvertragFuerJahresbericht, bis: Date): number {
  const buchhaltungAb = v.buchhaltungAb;
  const soll = berechneSoll(v, bis, buchhaltungAb);
  const ist = istNachZuordnung(v.zahlungen, buchhaltungAb ? periodeVon(buchhaltungAb) : -Infinity, periodeVon(bis));
  const sonder = v.sonderbewegungen
    .filter((s) => (!buchhaltungAb || s.datum >= buchhaltungAb) && s.datum <= bis)
    .reduce((sum, s) => sum + s.betrag, 0);
  return ist - soll + v.saldovortrag + sonder + gegenrechnungBis(gegenrechnungenVon(v), bis);
}

/** Gegenrechnungen (mit Versanddatum) der berechneten, versendeten Positionen eines Vertrags. */
function gegenrechnungenVon(v: MietvertragFuerJahresbericht): { betrag: number; datum: Date }[] {
  const liste: { betrag: number; datum: Date }[] = [];
  for (const p of v.nebenkostenPositionen) {
    if (p.versendetAm && p.unbezahlteVorauszahlung) liste.push({ betrag: p.unbezahlteVorauszahlung, datum: p.versendetAm });
  }
  return liste;
}

/**
 * positiv = noch offenes Guthaben (Vermieter schuldet Mieter), negativ = noch offene Nachzahlung —
 * bewusst nur für das Vorjahr des Berichtsjahres (z.B. im Jahresbericht 2025 nur die
 * 2024er-Abrechnung): eine Nebenkostenabrechnung wird typischerweise erst im Folgejahr beglichen,
 * gehört inhaltlich also in den Jahresbericht des Jahres, in dem die Zahlung tatsächlich erwartet
 * wird. Ältere, noch offene Jahre fließen hier bewusst nicht mehr mit ein (die vollständige
 * Historie bleibt über /nebenkostenabrechnungen einsehbar).
 */
function nebenkostenabrechnungOffenBetrag(v: MietvertragFuerJahresbericht, jahr: number, bis: Date): number | null {
  const vorjahresPosition = v.nebenkostenPositionen.find((p) => p.jahr === jahr - 1);
  if (!vorjahresPosition) return null;
  // Erst ab dem Versand der Abrechnung (manuelle Positionen haben kein Datum und zählen wie bisher).
  if (vorjahresPosition.versendetAm && vorjahresPosition.versendetAm > bis) return null;
  // Die unbezahlte Vorauszahlung steht schon als Rückstand im Mietsaldo; die Gutschrift dafür ist ab dem
  // Versanddatum Teil des Saldos (saldoZuStichtag). Hier bleibt nur die Abrechnung selbst — mit der
  // Gegenrechnung gerechnet und wieder herausgenommen, damit die Toleranz von 1 Cent wie bisher greift und
  // nichts doppelt zählt (siehe unbezahlteNkVorauszahlung).
  const gegenrechnung = vorjahresPosition.unbezahlteVorauszahlung ?? 0;
  const offen = saldoMitToleranz(vorjahresPosition.saldo + gegenrechnung - vorjahresPosition.zahlungSumme);
  return Math.round((offen - gegenrechnung) * 100) / 100 || 0;
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
 * Der Buchhaltungs-Stichtag gilt je Vertrag (`MietvertragFuerJahresbericht.buchhaltungAb`, eigener oder der des
 * Objekts): Verträge mit früherem Stichtag rechnen auch ihre früheren Jahre, die Summen der Tabelle mischen
 * dann unterschiedliche Stichtage (gewollt, in der Anzeige gekennzeichnet).
 *
 * Nur Mietverträge, die für das Jahr oder den offenen Nebenkostenabrechnung-Saldo tatsächlich
 * relevant sind, werden zurückgegeben — ein Vertrag ohne jede Bewegung/Saldo taucht nicht auf,
 * außer er steht in `immerAnzeigen` (nur bei berechneMieterBericht).
 */
export function berechneMieterJahresbericht(
  vertraege: MietvertragFuerJahresbericht[],
  jahr: number,
  buchhaltungBisGlobal: Date | null,
): MieterJahresberichtZeile[] {
  return berechneMieterBericht(
    vertraege,
    { jahr, von: new Date(jahr, 0, 1), bis: new Date(jahr, 11, 31, 23, 59, 59, 999) },
    buchhaltungBisGlobal,
  );
}

/**
 * Wie berechneMieterJahresbericht, aber für einen beliebigen Zeitraum [von, bis] innerhalb von
 * `jahr` (Quartalsübersicht). "Nebenkostenabrechnung offen (Vorjahr)" bezieht sich weiter auf die
 * Abrechnung des Vorjahres von `jahr` und fließt voll ein — außer bei `mitNkOffen: false` (Q1/Q2,
 * die Abrechnung liegt dann meist noch nicht vor): dann bleibt sie außen vor, Saldo neu ist der
 * reine Mietsaldo. Die Gutschrift der unbezahlten NK-Vorauszahlung zählt dagegen datumsgenau ab dem
 * Versand der Abrechnung (`versendetAm`), unabhängig vom Quartal.
 */
export function berechneMieterBericht(
  vertraege: MietvertragFuerJahresbericht[],
  zeitraum: { jahr: number; von: Date; bis: Date; mitNkOffen?: boolean },
  buchhaltungBisGlobal: Date | null,
  // Mietverträge, die auch ohne jede Bewegung/Saldo in der Tabelle bleiben (z.B. weil ein Kommentar
  // zum Abgleich mit dem Vorverwalter daran hängt).
  immerAnzeigen?: ReadonlySet<string>,
): MieterJahresberichtZeile[] {
  const { jahr } = zeitraum;
  const saldoAltBis = new Date(zeitraum.von.getTime() - 1);
  const saldoNeuBisKandidat = zeitraum.bis;
  const saldoNeuBis =
    buchhaltungBisGlobal && buchhaltungBisGlobal < saldoNeuBisKandidat
      ? buchhaltungBisGlobal
      : saldoNeuBisKandidat;
  const saldoNeuBisPeriode = periodeVon(saldoNeuBis);
  const vonPeriode = periodeVon(zeitraum.von);

  const zeilen: MieterJahresberichtZeile[] = [];

  for (const v of vertraege) {
    // Stichtag je Vertrag (v.buchhaltungAb): die Summen der Tabelle mischen dadurch ggf. unterschiedliche Stichtage.
    const saldoAlt = saldoZuStichtag(v, saldoAltBis);
    const soll = berechneSoll(v, saldoNeuBis, v.buchhaltungAb) - berechneSoll(v, saldoAltBis, v.buchhaltungAb);
    const sollKaltmiete =
      berechneSollKaltmiete(v, saldoNeuBis, v.buchhaltungAb) - berechneSollKaltmiete(v, saldoAltBis, v.buchhaltungAb);
    const sollNebenkosten = soll - sollKaltmiete;
    const letzterMonat = v.ende && v.ende < saldoNeuBis ? v.ende : saldoNeuBis;
    const mtl = ermittleMieteFuerMonat(v, letzterMonat.getFullYear(), letzterMonat.getMonth() + 1);
    const kaltmieteMtl = mtl.kaltmiete;
    const nebenkostenMtl = mtl.nebenkostenVorauszahlung + (v.mehrwertsteuer ?? 0);
  const miete = v.zahlungen
      .filter((z) => {
        const periode = z.periodeJahr * 12 + z.periodeMonat;
        return periode >= vonPeriode && periode <= saldoNeuBisPeriode;
      })
      .reduce((sum, z) => sum + z.betrag, 0);
    const nebenkostenabrechnungOffen =
      zeitraum.mitNkOffen === false ? null : nebenkostenabrechnungOffenBetrag(v, jahr, saldoNeuBis);
    // Gutschrift der unbezahlten NK-Vorauszahlung: gehört zum Mietsaldo (wie im Mieterkonto) ab dem Versand der
    // Abrechnung, hier die Beträge, die im Zeitraum versendet wurden (schon in saldoNeu enthalten).
    const nkGegenrechnung =
      Math.round(
        (gegenrechnungBis(gegenrechnungenVon(v), saldoNeuBis) - gegenrechnungBis(gegenrechnungenVon(v), saldoAltBis)) * 100,
      ) /
        100 || 0;
    // Inklusive der offenen Nebenkostenabrechnung des Vorjahres — im Mieterkonto steht dieselbe Zahl
    // als "Saldo inkl. offener Nebenkostenabrechnung" unter der Jahressumme.
    // Cent-genau gerundet (Gleitkomma-Reste wie -2,7e-14 würden sonst als "-0,00" bzw. nicht als 0 gelten).
    const saldoNeu =
      Math.round((saldoZuStichtag(v, saldoNeuBis) + (nebenkostenabrechnungOffen ?? 0)) * 100) / 100 || 0;

    if (
      !immerAnzeigen?.has(v.id) &&
      saldoAlt === 0 &&
      soll === 0 &&
      miete === 0 &&
      saldoNeu === 0 &&
      !nebenkostenabrechnungOffen &&
      !nkGegenrechnung
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
      // Auch bei Summe 0 geliefert: Abrechnung (offen ./. Gegenrechnung) und Gutschrift stehen getrennt.
      nebenkostenGegenrechnung: nkGegenrechnung,
    });
  }

  return zeilen.sort((a, b) => a.einheitBezeichnung.localeCompare(b.einheitBezeichnung, "de"));
}
