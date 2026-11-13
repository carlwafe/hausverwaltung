import { sollAufschluesselung, type MietvertragFuerSollIst } from "@/lib/soll-ist";

export type MieteMonatStatus = "bezahlt" | "teilweise" | "offen" | "nichtFaellig";

export type MieteMonatErgebnis = {
  soll: number;
  ist: number;
  offen: number;
  faelligAm: Date;
  status: MieteMonatStatus;
};

/**
 * Soll/Ist der Miete (Kaltmiete + NK-Vorauszahlung) eines Vertrags für einen Monat.
 * Gezählt werden Mietzahlungen nach Mietperiode (ohne Periode: Monat des Buchungsdatums).
 * `null`, wenn für den Monat kein Soll besteht. Gemeinsame Rechnung von /miete-monat und Dashboard.
 */
export function berechneMieteMonat(
  vertrag: MietvertragFuerSollIst,
  buchhaltungAb: Date | null,
  zahlungen: { datum: Date | null; betrag: number; periodeMonat: number | null; periodeJahr: number | null }[],
  jahr: number,
  monat: number,
  heute: Date,
): MieteMonatErgebnis | null {
  const aktuellerIndex = heute.getFullYear() * 12 + heute.getMonth();
  const istAktuellerMonat = jahr * 12 + (monat - 1) === aktuellerIndex;
  const monatsEnde = new Date(jahr, monat, 0);

  const sollZeile = sollAufschluesselung(vertrag, monatsEnde, buchhaltungAb).find(
    (z) => z.jahr === jahr && z.monat === monat,
  );
  if (!sollZeile || sollZeile.betrag <= 0) return null;

  let ist = 0;
  for (const z of zahlungen) {
    if (!z.datum) continue;
    const pJahr = z.periodeJahr && z.periodeMonat ? z.periodeJahr : z.datum.getFullYear();
    const pMonat = z.periodeJahr && z.periodeMonat ? z.periodeMonat : z.datum.getMonth() + 1;
    if (pJahr === jahr && pMonat === monat) ist += z.betrag;
  }

  const offen = Math.round((sollZeile.betrag - ist) * 100) / 100;
  const faellig = !istAktuellerMonat || heute >= sollZeile.faelligAm;
  const status: MieteMonatStatus = offen <= 0 ? "bezahlt" : !faellig ? "nichtFaellig" : ist > 0 ? "teilweise" : "offen";
  return { soll: sollZeile.betrag, ist, offen, faelligAm: sollZeile.faelligAm, status };
}
