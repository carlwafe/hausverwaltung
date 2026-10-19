import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Prisma } from "@/generated/prisma/client";
import { MAX_BELEG_AUSNAHME_GRUND, type BelegStatus } from "@/lib/beleg-anzeige";

// Belegprüfung der Nebenkostenabrechnung: Der Mieter darf die Belege einsehen, deshalb braucht jede umlagefähige
// Kostenposition ein Dokument (Dokument.buchungId, nicht ausgeblendet) — oder die ausdrückliche Markierung „Kein
// Beleg nötig“ (BuchungBelegAusnahme, mit Begründung). Status-Bedeutung: siehe beleg-anzeige.ts.
export type { BelegStatus };
export { MAX_BELEG_AUSNAHME_GRUND };

type PflichtEingabe = {
  bezugTyp: string | null;
  kostenart: { umlagefaehig: boolean; standardVerteilerschluessel: string | null } | null;
};

/**
 * Beleg-pflichtig ist eine umlagefähige Kostenposition, außer
 * - Kostenarten mit Schlüssel IN_ABRECHNUNG_ENTHALTEN (stecken in der Techem-Abrechnung, die selbst der Beleg ist),
 * - der Gegen-Gutschrift „Verrechnet mit Kaution“ (bezugTyp „Buchung“; die verrechnete Rechnung trägt den Beleg).
 */
export function belegPflichtig(p: PflichtEingabe): boolean {
  if (!p.kostenart?.umlagefaehig) return false;
  if (p.kostenart.standardVerteilerschluessel === "IN_ABRECHNUNG_ENTHALTEN") return false;
  if (p.bezugTyp === "Buchung") return false;
  return true;
}

/**
 * Status je Position (Schlüssel = Buchungs-ID). `client` erlaubt die Nutzung innerhalb einer Transaktion.
 * Drei kleine Abfragen ohne Includes; nicht beleg-pflichtige Positionen bekommen ohne Abfrage ENTFAELLT.
 */
export async function ladeBelegStatus(
  positionen: (PflichtEingabe & { id: string; aufteilungGruppeId: string | null })[],
  client: Pick<Prisma.TransactionClient, "buchung" | "dokument" | "buchungBelegAusnahme"> = prisma,
): Promise<Map<string, BelegStatus>> {
  const ergebnis = new Map<string, BelegStatus>();
  const pflichtig = positionen.filter(belegPflichtig);
  for (const p of positionen) if (!belegPflichtig(p)) ergebnis.set(p.id, "ENTFAELLT");
  if (pflichtig.length === 0) return ergebnis;

  const ids = pflichtig.map((p) => p.id);
  const gruppenIds = [...new Set(pflichtig.map((p) => p.aufteilungGruppeId).filter((g): g is string => g != null))];

  const [mitglieder, ausnahmen] = await Promise.all([
    gruppenIds.length > 0
      ? client.buchung.findMany({
          where: { aufteilungGruppeId: { in: gruppenIds }, buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
          select: { id: true, aufteilungGruppeId: true },
        })
      : Promise.resolve([] as { id: string; aufteilungGruppeId: string | null }[]),
    client.buchungBelegAusnahme.findMany({ where: { buchungId: { in: ids } }, select: { buchungId: true } }),
  ]);

  const alleIds = [...new Set([...ids, ...mitglieder.map((m) => m.id)])];
  const dokumente = await client.dokument.findMany({
    where: { buchungId: { in: alleIds }, ausgeblendetAm: null },
    select: { buchungId: true },
  });
  const mitBeleg = new Set(dokumente.map((d) => d.buchungId));
  const gruppeBelegt = new Set(
    mitglieder.filter((m) => mitBeleg.has(m.id)).map((m) => m.aufteilungGruppeId as string),
  );
  const mitAusnahme = new Set(ausnahmen.map((a) => a.buchungId));

  for (const p of pflichtig) {
    const belegt = mitBeleg.has(p.id) || (p.aufteilungGruppeId != null && gruppeBelegt.has(p.aufteilungGruppeId));
    ergebnis.set(p.id, belegt ? "BELEGT" : mitAusnahme.has(p.id) ? "AUSNAHME" : "FEHLT");
  }
  return ergebnis;
}

// „Bearbeiten“ und „Aufteilen“ einer Kostenposition sind Storno + Neuanlage — die Markierung hängt an der Buchungs-ID
// und wird deshalb wie der Kommentar (uebernehmeBuchungKommentar) auf die neue(n) Position(en) kopiert; an der
// stornierten Original-Position bleibt sie als Historie stehen.
export async function uebernehmeBelegAusnahme(
  tx: Prisma.TransactionClient,
  vonBuchungId: string,
  nachBuchungIds: string | string[],
) {
  const ziele = Array.isArray(nachBuchungIds) ? nachBuchungIds : [nachBuchungIds];
  if (ziele.length === 0) return;
  const ausnahme = await tx.buchungBelegAusnahme.findUnique({ where: { buchungId: vonBuchungId } });
  if (!ausnahme) return;
  await tx.buchungBelegAusnahme.createMany({
    data: ziele.map((buchungId) => ({ buchungId, grund: ausnahme.grund, gesetztVon: ausnahme.gesetztVon })),
    skipDuplicates: true,
  });
}
