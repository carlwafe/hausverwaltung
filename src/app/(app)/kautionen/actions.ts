"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

export async function deleteKautionsbuchungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.kautionBuchung.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/kautionen");
}

const KATEGORIE_WERTE = [
  "EINZAHLUNG_MIETER",
  "ANLAGE",
  "AUFLOESUNG",
  "AUSZAHLUNG_MIETER",
  "SONSTIGES",
  "VIRTUELLE_AUSZAHLUNG",
] as const;
type KautionBuchungKategorie = (typeof KATEGORIE_WERTE)[number];

export async function aktualisiereKautionsbuchungKategorie(id: string, kategorie: KautionBuchungKategorie) {
  await requireEditor();
  if (!KATEGORIE_WERTE.includes(kategorie)) return;
  await prisma.kautionBuchung.update({ where: { id }, data: { kategorie } });
  revalidatePath("/kautionen");
}

const kautionsbuchungSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  datum: z.string().min(1, "Datum ist erforderlich"),
  // Vorzeichen wie bei einer echten Kontobuchung: positiv = eingehend (Einzahlung Mieter,
  // Auflösung), negativ = ausgehend (Anlage, Auszahlung Mieter) — siehe dieselbe Konvention beim
  // CSV-Import in zahlungen-import.ts/kontoauszug-import/actions.ts (commitKautionsbuchungen).
  betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
  kategorie: z.enum(KATEGORIE_WERTE, { message: "Kategorie ist erforderlich" }),
  verwendungszweck: z.string().optional(),
  // Nur bei Kategorie VIRTUELLE_AUSZAHLUNG relevant — verknüpft die neue Buchung direkt mit ihrer
  // Gegenbuchung auf der Kosten-Seite (Kostenposition.virtuelleKautionBuchungId).
  verknuepfteKostenpositionId: z.string().optional(),
});

// Für Fälle, die sich nicht aus einer einzelnen Kontobuchung ergeben (z.B. ein einbehaltener
// Kautionsrest, der teils für eine Reparatur verwendet und teils in einer Nebenkostenabrechnung
// verrechnet wurde, ohne dass dafür je eine als "Kaution" erkennbare Auszahlung überwiesen
// wurde) — legt eine Kautionsbuchung ohne Rohdaten/Import-Bezug an, damit sich Einbehalten/Status
// auf der Kautionen-Seite trotzdem korrekt berechnen, siehe kautionsbuchungen-table.tsx
// ("manuell" statt Rohdaten-Anzeige).
export async function erstelleKautionsbuchung(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();

  const parsed = kautionsbuchungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    kategorie: formData.get("kategorie"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
    verknuepfteKostenpositionId: formData.get("verknuepfteKostenpositionId") || undefined,
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { mietvertragId, datum, betrag, kategorie, verwendungszweck, verknuepfteKostenpositionId } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const buchung = await tx.kautionBuchung.create({
      data: { mietvertragId, datum: new Date(datum), betrag, kategorie, verwendungszweck },
    });
    if (verknuepfteKostenpositionId) {
      await tx.kostenposition.update({
        where: { id: verknuepfteKostenpositionId },
        data: { virtuelleKautionBuchungId: buchung.id },
      });
    }
  });

  revalidatePath("/kautionen");
  revalidatePath("/kosten");
  return null;
}
