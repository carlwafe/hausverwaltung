// Darlehenskonto (Soll/Ist) je Darlehen und Jahr, ähnlich dem Mieterkonto: Soll = Rate laut nachgerechnetem Tilgungsplan
// (src/lib/tilgungsplan.ts), Ist = die über das Mietkonto gebuchten Raten, dem Monat zugeordnet, für den sie gezahlt
// wurden (DarlehenZuordnung.periodeMonat; ohne Angabe der Monat des Buchungsdatums). Sonderbuchungen (z.B.
// Verzugszinsen) gehören zum Darlehen, stehen aber nicht im Soll und werden gesondert ausgewiesen. Reine Funktion.
import type { Rate } from "@/lib/tilgungsplan";

/** Ab diesem Monat laufen die Darlehen über das Mietkonto, erst dann gibt es Ist-Buchungen im Journal. */
export const MIETKONTO_AB = { jahr: 2026, monat: 11 };

export type IstRate = {
  ankerId: string;
  /** Kostenposition des Zinsanteils (für den Link), falls vorhanden. */
  zinsId: string | null;
  datum: Date;
  periodeJahr: number;
  periodeMonat: number;
  zins: number;
  tilgung: number;
  sonder: boolean;
  text: string;
};

export type Betraege = { rate: number; zins: number; tilgung: number };

export type KontoStatus = "nicht-im-journal" | "ok" | "abweichung" | "offen" | "bevorstehend";

export type KontoZeile = {
  jahr: number;
  monat: number;
  planDatum: Date | null;
  zinssatz: number | null;
  nachZinsbindung: boolean;
  soll: Betraege | null;
  ist: (Betraege & { zinsIds: string[]; ankerIds: string[] }) | null;
  restschuldPlan: number | null;
  /** Restschuld nach den gebuchten Tilgungen (ab der ersten gebuchten Rate), sonst null. */
  restschuldIst: number | null;
  status: KontoStatus;
};

export type Darlehenskonto = {
  zeilen: KontoZeile[];
  sonder: IstRate[];
  /** Summe der Monate ab Mietkonto-Beginn: Soll und Ist. */
  summeSoll: Betraege;
  summeIst: Betraege;
  summeSonder: number;
  /** Soll des ganzen Jahres laut Plan (auch Monate vor dem Mietkonto). */
  sollJahr: Betraege;
  anzahlOffen: number;
};

const cent = (n: number) => Math.round(n * 100) / 100;
const schluessel = (jahr: number, monat: number) => jahr * 12 + monat;
const leer = (): Betraege => ({ rate: 0, zins: 0, tilgung: 0 });
const addiere = (a: Betraege, b: Betraege): Betraege => ({ rate: cent(a.rate + b.rate), zins: cent(a.zins + b.zins), tilgung: cent(a.tilgung + b.tilgung) });

export function baueDarlehenskonto(raten: Rate[], istAlle: IstRate[], startRestschuld: number, jahr: number, heute: Date): Darlehenskonto {
  const mietkonto = schluessel(MIETKONTO_AB.jahr, MIETKONTO_AB.monat);
  const istRaten = istAlle.filter((i) => !i.sonder);

  // Restschuld nach Buchungen: Ausgangspunkt ist die Plan-Restschuld vor der ersten gebuchten Rate.
  const ersterIst = istRaten.length ? Math.min(...istRaten.map((i) => schluessel(i.periodeJahr, i.periodeMonat))) : null;
  let restVorErstem = startRestschuld;
  if (ersterIst !== null) {
    for (const r of raten) {
      if (schluessel(r.jahr, r.monat) >= ersterIst) break;
      restVorErstem = r.restschuld;
    }
  }
  const istRestschuldBis = (key: number) =>
    cent(restVorErstem - istRaten.filter((i) => schluessel(i.periodeJahr, i.periodeMonat) <= key).reduce((s, i) => s + i.tilgung, 0));

  const monate = new Set<number>();
  for (const r of raten) if (r.jahr === jahr) monate.add(r.monat);
  for (const i of istRaten) if (i.periodeJahr === jahr) monate.add(i.periodeMonat);

  const zeilen: KontoZeile[] = [...monate]
    .sort((a, b) => a - b)
    .map((monat) => {
      const key = schluessel(jahr, monat);
      const plan = raten.filter((r) => r.jahr === jahr && r.monat === monat);
      const soll = plan.length ? plan.reduce((s, r) => addiere(s, { rate: r.rate, zins: r.zins, tilgung: r.tilgung }), leer()) : null;
      const istMonat = istRaten.filter((i) => i.periodeJahr === jahr && i.periodeMonat === monat);
      const ist = istMonat.length
        ? { ...istMonat.reduce((s, i) => addiere(s, { rate: cent(i.zins + i.tilgung), zins: i.zins, tilgung: i.tilgung }), leer()), zinsIds: istMonat.flatMap((i) => (i.zinsId ? [i.zinsId] : [])), ankerIds: istMonat.map((i) => i.ankerId) }
        : null;
      const planDatum = plan.length ? plan[plan.length - 1].datum : null;
      let status: KontoStatus;
      if (ist) {
        status = soll && Math.abs(ist.rate - soll.rate) < 0.005 && Math.abs(ist.zins - soll.zins) < 0.005 ? "ok" : "abweichung";
      } else if (key < mietkonto) {
        status = "nicht-im-journal";
      } else {
        status = planDatum && planDatum.getTime() <= heute.getTime() ? "offen" : "bevorstehend";
      }
      return {
        jahr,
        monat,
        planDatum,
        zinssatz: plan.length ? plan[plan.length - 1].zinssatz : null,
        nachZinsbindung: plan.some((r) => r.nachZinsbindung),
        soll,
        ist,
        restschuldPlan: plan.length ? plan[plan.length - 1].restschuld : null,
        restschuldIst: ersterIst !== null && key >= ersterIst ? istRestschuldBis(key) : null,
        status,
      };
    });

  const imKonto = zeilen.filter((z) => schluessel(z.jahr, z.monat) >= mietkonto);
  const sonder = istAlle.filter((i) => i.sonder && i.datum.getUTCFullYear() === jahr).sort((a, b) => a.datum.getTime() - b.datum.getTime());
  return {
    zeilen,
    sonder,
    summeSoll: imKonto.reduce((s, z) => (z.soll ? addiere(s, z.soll) : s), leer()),
    summeIst: imKonto.reduce((s, z) => (z.ist ? addiere(s, z.ist) : s), leer()),
    summeSonder: cent(sonder.reduce((s, i) => s + i.zins + i.tilgung, 0)),
    sollJahr: zeilen.reduce((s, z) => (z.soll ? addiere(s, z.soll) : s), leer()),
    anzahlOffen: zeilen.filter((z) => z.status === "offen").length,
  };
}

/** Anzahl der Monate ab Mietkonto-Beginn, deren Rate fällig war und nicht gebucht ist (über alle Jahre; für die Übersicht). */
export function zaehleOffeneMonate(raten: Rate[], istAlle: IstRate[], heute: Date): number {
  const mietkonto = schluessel(MIETKONTO_AB.jahr, MIETKONTO_AB.monat);
  const gebucht = new Set(istAlle.filter((i) => !i.sonder).map((i) => schluessel(i.periodeJahr, i.periodeMonat)));
  const faellig = new Map<number, Date>();
  for (const r of raten) {
    const key = schluessel(r.jahr, r.monat);
    if (key >= mietkonto && r.datum.getTime() <= heute.getTime()) faellig.set(key, r.datum);
  }
  let offen = 0;
  for (const key of faellig.keys()) if (!gebucht.has(key)) offen++;
  return offen;
}
