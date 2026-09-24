"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

/**
 * Markiert/entmarkiert, dass "Saldo neu" für diesen Mietvertrag/dieses Jahr mit dem vorhandenen
 * (externen, vom früheren Verwalter erstellten) Jahresbericht abgeglichen und für übereinstimmend
 * befunden wurde — reine Existenz der Zeile, siehe Schema-Kommentar auf JahresberichtVerifikation.
 */
export async function toggleJahresberichtVerifiziert(mietvertragId: string, jahr: number) {
  await requireEditor();

  const bestehend = await prisma.jahresberichtVerifikation.findUnique({
    where: { mietvertragId_jahr: { mietvertragId, jahr } },
  });

  if (bestehend) {
    await prisma.jahresberichtVerifikation.delete({ where: { id: bestehend.id } });
  } else {
    await prisma.jahresberichtVerifikation.create({ data: { mietvertragId, jahr } });
  }

  revalidatePath("/jahresuebersicht");
}

// Kommentar pro Mietvertrag und Jahr (leer = entfernt).
export async function speichereJahresberichtKommentar(mietvertragId: string, jahr: number, kommentar: string) {
  await requireEditor();
  const text = kommentar.trim();
  const where = { mietvertragId_jahr: { mietvertragId, jahr } };
  if (!text) {
    await prisma.jahresberichtKommentar.deleteMany({ where: { mietvertragId, jahr } });
  } else {
    await prisma.jahresberichtKommentar.upsert({
      where,
      create: { mietvertragId, jahr, kommentar: text },
      update: { kommentar: text },
    });
  }
  revalidatePath("/jahresuebersicht");
}

const kontenabgleichSchema = z.object({
  jahr: z.coerce.number().int(),
  kontostandLautBankauszug: z.coerce.number(),
});

/**
 * Der einzige Bezug zur Realität im Kontenabgleich (siehe ladeKontenabgleich in page.tsx): der
 * dort berechnete Kontostand-Endsaldo rechnet sich nur selbst nach (intern konsistent), erst der
 * Abgleich gegen diesen manuell vom echten Kontoauszug abgelesenen Wert kann eine tatsächlich
 * fehlende oder falsch geflaggte Buchung aufdecken.
 */
export async function speichereKontenabgleichVerifikation(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const parsed = kontenabgleichSchema.safeParse({
    jahr: formData.get("jahr"),
    kontostandLautBankauszug: formData.get("kontostandLautBankauszug"),
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { jahr, kontostandLautBankauszug } = parsed.data;

  await prisma.kontenabgleichVerifikation.upsert({
    where: { jahr },
    update: { kontostandLautBankauszug },
    create: { jahr, kontostandLautBankauszug },
  });

  revalidatePath("/jahresuebersicht");
  return null;
}

export async function loescheKontenabgleichVerifikation(jahr: number) {
  await requireEditor();
  await prisma.kontenabgleichVerifikation.deleteMany({ where: { jahr } });
  revalidatePath("/jahresuebersicht");
}
