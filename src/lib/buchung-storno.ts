import type { Prisma } from "@/generated/prisma/client";

// Für jede Anzeige-/Summenabfrage, die nur "lebende" Buchungen sehen soll: schließt sowohl eine
// bereits stornierte Zeile (storniertDurchBuchungId gesetzt) als auch ihre eigene
// Storno-Gegenbuchung (storniertZeile gesetzt) aus. Beide zusammen heben sich betragsmäßig ohnehin
// zu 0 auf — das Ausblenden ist deshalb auch für Summenberechnungen unbedenklich, nicht nur für
// Listenansichten (die Historie bleibt über eine Abfrage ohne diesen Filter weiterhin einsehbar).
export const AKTIVE_BUCHUNG_FILTER = { storniertDurchBuchungId: null, storniertZeile: null } as const;

// Kernbaustein des Storno-Prinzips (siehe Buchung.storniertDurchBuchungId im Schema): keine
// echten UPDATE/DELETE einer bereits gebuchten Buchung aus der Anwendung heraus. Stattdessen
// entsteht eine Gegenbuchung mit exakt negiertem Betrag, sonst identischen Feldern, die über
// storniertDurchBuchungId zurückverweist — die ursprüngliche Zeile bleibt unverändert und
// unverlierbar stehen; Summenberichte (z.B. /kontostand) brauchen dafür keine Sonderbehandlung,
// weil Original + Storno sich durch ihre entgegengesetzten Vorzeichen automatisch aufheben.
// "Löschen" einer Buchung heißt: nur stornieren (Original bleibt stehen). "Bearbeiten" heißt:
// stornieren + mit den korrigierten Werten neu anlegen (siehe Aufrufstellen).
export async function storniereBuchung(tx: Prisma.TransactionClient, buchungId: string) {
  const original = await tx.buchung.findUniqueOrThrow({ where: { id: buchungId } });
  if (original.storniertDurchBuchungId) {
    throw new Error("Diese Buchung wurde bereits storniert.");
  }
  const storno = await tx.buchung.create({
    data: {
      mietvertragId: original.mietvertragId,
      buchungsartId: original.buchungsartId,
      datum: original.datum,
      betrag: -Number(original.betrag),
      kostenartId: original.kostenartId,
      gebaeudeId: original.gebaeudeId,
      hausId: original.hausId,
      kostengruppeId: original.kostengruppeId,
      einheitId: original.einheitId,
      periodeMonat: original.periodeMonat,
      periodeJahr: original.periodeJahr,
      jahr: original.jahr,
      empfaenger: original.empfaenger,
      verwendungszweck: original.verwendungszweck ? `Storno: ${original.verwendungszweck}` : "Storno",
      bemerkung: original.bemerkung,
      bezugTyp: original.bezugTyp,
      bezugId: original.bezugId,
      rohdaten: original.rohdaten ?? undefined,
      // importBatchId/aufteilungGruppeId bewusst NICHT übernommen: der Storno ist keine eigene
      // Import-Zeile und soll weder in der Vollständigkeitsprüfung des Original-Batches noch in
      // einer Aufteilungsgruppe auftauchen.
    },
  });
  await tx.buchung.update({ where: { id: buchungId }, data: { storniertDurchBuchungId: storno.id } });
  return storno;
}
