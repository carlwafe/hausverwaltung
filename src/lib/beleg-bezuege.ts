import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ladeDienstleisterVorschlag } from "@/lib/dokument-zuordnung";

type Client = Prisma.TransactionClient | typeof prisma;

export type BelegBezuege = {
  einheitId: string | null;
  gebaeudeId: string | null;
  hausId: string | null;
  dienstleisterId: string | null;
};

/**
 * Bezüge, die ein Kostenbeleg von seiner Kostenposition übernimmt: Einheit, Gebäude und Haus stehen an der Buchung,
 * der Dienstleister wird (wie im Kosten-Import) über seine Suchbegriffe aus dem Empfänger der Buchung bestimmt — die
 * Buchung selbst trägt keinen Dienstleister. Ohne Treffer bleibt der jeweilige Bezug leer.
 */
export async function ladeBelegBezuege(buchungId: string, client: Client = prisma): Promise<BelegBezuege> {
  const b = await client.buchung.findUnique({
    where: { id: buchungId },
    select: { einheitId: true, gebaeudeId: true, hausId: true, empfaenger: true },
  });
  const dienstleister = await ladeDienstleisterVorschlag(b?.empfaenger ?? null);
  return {
    einheitId: b?.einheitId ?? null,
    gebaeudeId: b?.gebaeudeId ?? null,
    hausId: b?.hausId ?? null,
    dienstleisterId: dienstleister?.dienstleisterId ?? null,
  };
}

/**
 * Beim Bearbeiten einer Kostenposition (Storno + Neuanlage) ändert sich ggf. die Zuordnung. Die an den Belegen
 * übernommenen Bezüge ziehen dann mit — aber nur, wo der Beleg noch genau den alten Wert trägt; ein von Hand
 * geänderter oder ergänzter Bezug bleibt unberührt. Muss nach dem Umhängen der Belege auf `neuId` laufen.
 */
export async function ziehBelegBezuegeNach(
  tx: Prisma.TransactionClient,
  neuId: string,
  alt: { einheitId: string | null; gebaeudeId: string | null; hausId: string | null },
  neu: { einheitId: string | null; gebaeudeId: string | null; hausId: string | null },
) {
  for (const feld of ["einheitId", "gebaeudeId", "hausId"] as const) {
    if (alt[feld] === neu[feld]) continue;
    await tx.dokument.updateMany({
      where: { buchungId: neuId, [feld]: alt[feld] },
      data: { [feld]: neu[feld] },
    });
  }
}
