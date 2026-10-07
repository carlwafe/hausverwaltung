import type { Prisma } from "@/generated/prisma/client";

export const MAX_BUCHUNG_KOMMENTAR = 1000;

// "Bearbeiten", "Umbuchen" und "Aufteilen" einer Buchung sind Storno + Neuanlage (siehe
// storniereBuchung) — der Kommentar hängt an der Buchungs-ID und würde sonst an der stornierten Zeile
// zurückbleiben. Deshalb wird er auf die neue(n) Buchung(en) kopiert; an der stornierten Original-
// Buchung bleibt er als Historie stehen. Ohne Kommentar am Original passiert nichts.
export async function uebernehmeBuchungKommentar(
  tx: Prisma.TransactionClient,
  vonBuchungId: string,
  nachBuchungIds: string | string[],
) {
  const ziele = Array.isArray(nachBuchungIds) ? nachBuchungIds : [nachBuchungIds];
  if (ziele.length === 0) return;
  const kommentar = await tx.buchungKommentar.findUnique({ where: { buchungId: vonBuchungId } });
  if (!kommentar) return;
  await tx.buchungKommentar.createMany({
    data: ziele.map((buchungId) => ({ buchungId, text: kommentar.text, geaendertVon: kommentar.geaendertVon })),
    skipDuplicates: true,
  });
}
