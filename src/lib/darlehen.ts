// Darlehensraten, die über das Mietkonto laufen (Entscheidung 14.10.2026): Eine Abbuchung besteht aus
// Zinsen (Werbungskosten, Schuldzinsen der Anlage V) und Tilgung (kein Aufwand, mindert nur die Restschuld).
// Im Journal sind das zwei Buchungen mit denselben Rohdaten der Bankzeile:
//  * Tilgung = Buchungsart DARLEHEN_TILGUNG (Bankvorzeichen, bewegt den Kontostand, nicht eur-relevant),
//  * Zins    = KOSTENPOSITION einer Kostenart mit Einordnung SCHULDZINSEN (positiv = Ausgabe).
// Der Zins verweist per bezugTyp/bezugId auf die Tilgung, damit Löschen (Storno) beide trifft und der
// Vollständigkeits-Check die Bankzeile nicht als doppelt erfasst meldet.
import type { Prisma } from "@/generated/prisma/client";
import { AktionsFehler } from "@/lib/aktion";

export const DARLEHEN_BUCHUNGSART = "DARLEHEN_TILGUNG";
export const DARLEHEN_BEZUG = "Darlehensrate";

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Teilt den Bankbetrag einer Rate (Bankvorzeichen, Abbuchung negativ) in Zins und Tilgung.
 * `zinsanteil` ist der positive Zinsbetrag laut Tilgungsplan; ohne Zinsanteil ist alles Tilgung
 * (z.B. Sondertilgung). Rückgabe: Zins als positive Ausgabe, Tilgung mit Bankvorzeichen.
 */
export function teileDarlehensrate(bankBetrag: number, zinsanteil: number): { zins: number; tilgung: number } {
  const zins = cent(zinsanteil);
  if (!Number.isFinite(zins) || zins < 0) throw new AktionsFehler("Der Zinsanteil darf nicht negativ sein.");
  if (zins === 0) return { zins: 0, tilgung: cent(bankBetrag) };
  if (bankBetrag >= 0) throw new AktionsFehler("Einen Zinsanteil gibt es nur bei einer Abbuchung (negativer Betrag).");
  if (zins > cent(-bankBetrag)) {
    throw new AktionsFehler("Der Zinsanteil ist höher als die gesamte Rate.");
  }
  return { zins, tilgung: cent(bankBetrag + zins) };
}

export type DarlehensrateEingabe = {
  datum: Date;
  bankBetrag: number;
  zinsanteil: number;
  // Pflicht, sobald ein Zinsanteil gebucht wird: Kostenart mit Einordnung „Schuldzinsen“.
  kostenartId: string | null;
  empfaenger: string | null;
  verwendungszweck: string | null;
  rohdaten: Prisma.InputJsonValue | undefined;
  importBatchId: string | null;
  erstelltVon: string | null;
  // Darlehen der Stammdaten, zu dem die Rate gehört (siehe DarlehenZuordnung).
  darlehenId?: string | null;
  // Monat, für den die Rate gezahlt wurde (Soll/Ist im Darlehenskonto), und Kennzeichen „Sonderbuchung“ (z.B.
  // Verzugszinsen: keine Rate des Plans, wird nicht mit dem Soll verglichen).
  periodeJahr?: number | null;
  periodeMonat?: number | null;
  sonder?: boolean;
  // Gemeinsame Gruppe der Teile einer auf mehrere Monate aufgeteilten Zahlung (Buchung.aufteilungGruppeId).
  aufteilungGruppeId?: string | null;
};

/**
 * Legt Tilgung und Zins einer Rate an (in der Transaktion des Aufrufers). Gibt die Anzahl neuer Buchungen und die
 * Buchung zurück, an der die Zuordnung zum Darlehen hängt (Tilgung, ohne Tilgungsanteil die Zinsbuchung).
 */
export async function legeDarlehensrateAn(
  tx: Prisma.TransactionClient,
  e: DarlehensrateEingabe,
  buchungsartIds: { tilgung: string; kosten: string },
): Promise<{ anzahl: number; ankerId: string | null }> {
  const { zins, tilgung } = teileDarlehensrate(e.bankBetrag, e.zinsanteil);
  if (zins > 0 && !e.kostenartId) throw new AktionsFehler("Für den Zinsanteil fehlt die Kostenart (Schuldzinsen).");

  const gemeinsam = {
    datum: e.datum,
    empfaenger: e.empfaenger,
    verwendungszweck: e.verwendungszweck,
    rohdaten: e.rohdaten,
    importBatchId: e.importBatchId ?? undefined,
    erstelltVon: e.erstelltVon,
    aufteilungGruppeId: e.aufteilungGruppeId ?? undefined,
  };
  let anzahl = 0;
  let tilgungId: string | null = null;
  let zinsId: string | null = null;
  if (tilgung !== 0) {
    const t = await tx.buchung.create({
      data: { ...gemeinsam, buchungsartId: buchungsartIds.tilgung, betrag: tilgung },
    });
    tilgungId = t.id;
    anzahl++;
  }
  if (zins > 0) {
    const z = await tx.buchung.create({
      data: {
        ...gemeinsam,
        buchungsartId: buchungsartIds.kosten,
        kostenartId: e.kostenartId,
        betrag: zins,
        jahr: e.datum.getUTCFullYear(),
        bezugTyp: tilgungId ? DARLEHEN_BEZUG : undefined,
        bezugId: tilgungId ?? undefined,
      },
    });
    zinsId = z.id;
    anzahl++;
  }
  const ankerId = tilgungId ?? zinsId;
  if (e.darlehenId && ankerId) {
    await ordneDarlehenZu(tx, ankerId, e.darlehenId, e.erstelltVon, {
      periodeJahr: e.sonder ? null : e.periodeJahr ?? null,
      periodeMonat: e.sonder ? null : e.periodeMonat ?? null,
      sonder: !!e.sonder,
    });
  }
  return { anzahl, ankerId };
}

/** Ordnet eine Rate (Anker-Buchung) einem Darlehen zu; ersetzt eine vorhandene Zuordnung, ohne Darlehen wird sie entfernt. */
export async function ordneDarlehenZu(
  tx: Pick<Prisma.TransactionClient, "darlehenZuordnung">,
  ankerId: string,
  darlehenId: string | null,
  erstelltVon: string | null,
  // Monat/Sonderbuchung nur angeben, wenn sie gesetzt werden sollen; ohne Angabe bleiben bestehende Werte unverändert.
  extra?: { periodeJahr?: number | null; periodeMonat?: number | null; sonder?: boolean },
): Promise<void> {
  if (!darlehenId) {
    await tx.darlehenZuordnung.deleteMany({ where: { buchungId: ankerId } });
    return;
  }
  await tx.darlehenZuordnung.upsert({
    where: { buchungId: ankerId },
    create: { buchungId: ankerId, darlehenId, erstelltVon, ...extra },
    update: { darlehenId, erstelltVon, ...extra },
  });
}
