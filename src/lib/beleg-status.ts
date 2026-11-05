import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Prisma } from "@/generated/prisma/client";
import { MAX_BELEG_AUSNAHME_GRUND, type BelegStatus } from "@/lib/beleg-anzeige";

// Belegprüfung: Jede Kostenposition braucht ein Dokument (Dokument.buchungId, nicht ausgeblendet) — für den Mieter, der die
// Belege zur Nebenkostenabrechnung einsehen darf, und für eine Prüfung durch das Finanzamt — oder die ausdrückliche
// Markierung „Kein Beleg nötig“ (BuchungBelegAusnahme, mit Begründung). Status-Bedeutung: siehe beleg-anzeige.ts.
export type { BelegStatus };
export { MAX_BELEG_AUSNAHME_GRUND };

type PflichtEingabe = {
  bezugTyp: string | null;
  kostenart: { belegErforderlich: boolean } | null;
};

/**
 * Beleg-pflichtig ist jede Kostenposition mit Kostenart, außer
 * - Kostenarten, bei denen kein Einzelbeleg verlangt wird (Kostenart.belegErforderlich = false: Kontoauszug bzw. interne
 *   Forderung ist der Beleg, z.B. Bankgebühren, Mahngebühren),
 * - der Gegen-Gutschrift „Verrechnet mit Kaution“ (bezugTyp „Buchung“; die verrechnete Rechnung trägt den Beleg).
 * Auch die Techem-Kostenarten (Schlüssel IN_ABRECHNUNG_ENTHALTEN) sind beleg-pflichtig: Die Techem-Abrechnung wird als
 * gemeinsamer Beleg an die Positionen gehängt.
 */
export function belegPflichtig(p: PflichtEingabe): boolean {
  if (!p.kostenart?.belegErforderlich) return false;
  if (p.bezugTyp === "Buchung") return false;
  return true;
}

/**
 * Status je Position (Schlüssel = Buchungs-ID). `client` erlaubt die Nutzung innerhalb einer Transaktion.
 * Drei kleine Abfragen ohne Includes; nicht beleg-pflichtige Positionen bekommen ohne Abfrage ENTFAELLT.
 */
export async function ladeBelegStatus(
  positionen: (PflichtEingabe & { id: string; aufteilungGruppeId: string | null })[],
  client: Pick<Prisma.TransactionClient, "buchung" | "dokument" | "dokumentBuchung" | "buchungBelegAusnahme"> = prisma,
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
  const [dokumente, mitbenutzt] = await Promise.all([
    client.dokument.findMany({ where: { buchungId: { in: alleIds }, ausgeblendetAm: null }, select: { buchungId: true } }),
    // Gemeinsamer Beleg: ein Dokument, das an einer anderen (Haupt-)Position hängt und diese Position mitabdeckt.
    client.dokumentBuchung.findMany({ where: { buchungId: { in: alleIds }, dokument: { ausgeblendetAm: null } }, select: { buchungId: true } }),
  ]);
  const mitBeleg = new Set<string | null>([...dokumente.map((d) => d.buchungId), ...mitbenutzt.map((m) => m.buchungId)]);
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

/**
 * Beim Ersetzen einer Kostenposition (Bearbeiten, Aufteilen, Zusammenführen, Umbuchen) hängen die „weiteren Positionen“
 * gemeinsamer Belege (DokumentBuchung) an der alten Position — sie ziehen wie die Hauptbelege (`dokument.updateMany`) auf die
 * neue um. Aufrufen NACH dem Umhängen von `Dokument.buchungId`: eine Zeile, die dann auf die Hauptposition selbst zeigen
 * würde, entfällt, und Doppelte (Zusammenführen) werden zusammengelegt.
 */
export async function verlegeMitbenutzteBelege(tx: Prisma.TransactionClient, vonBuchungIds: string[], nachBuchungId: string) {
  if (vonBuchungIds.length === 0) return;
  const zeilen = await tx.dokumentBuchung.findMany({ where: { buchungId: { in: vonBuchungIds } } });
  if (zeilen.length === 0) return;
  const hauptDokumente = await tx.dokument.findMany({
    where: { id: { in: zeilen.map((z) => z.dokumentId) }, buchungId: nachBuchungId },
    select: { id: true },
  });
  const istHaupt = new Set(hauptDokumente.map((d) => d.id));
  await tx.dokumentBuchung.deleteMany({ where: { id: { in: zeilen.map((z) => z.id) } } });
  const neu = new Map<string, { dokumentId: string; buchungId: string; erstelltVon: string | null }>();
  for (const z of zeilen) {
    if (istHaupt.has(z.dokumentId) || neu.has(z.dokumentId)) continue;
    neu.set(z.dokumentId, { dokumentId: z.dokumentId, buchungId: nachBuchungId, erstelltVon: z.erstelltVon });
  }
  if (neu.size > 0) await tx.dokumentBuchung.createMany({ data: [...neu.values()], skipDuplicates: true });
}
