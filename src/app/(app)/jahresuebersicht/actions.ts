"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { mitMeldung } from "@/lib/aktion";

/**
 * Markiert/entmarkiert, dass "Saldo neu" für diesen Mietvertrag/dieses Jahr mit dem vorhandenen
 * (externen, vom früheren Verwalter erstellten) Jahresbericht abgeglichen und für übereinstimmend
 * befunden wurde — reine Existenz der Zeile, siehe Schema-Kommentar auf JahresberichtVerifikation.
 */
export async function toggleJahresberichtVerifiziert(mietvertragId: string, jahr: number, quartal = 0) {
  await requireEditor();

  const bestehend = await prisma.jahresberichtVerifikation.findUnique({
    where: { mietvertragId_jahr_quartal: { mietvertragId, jahr, quartal } },
  });

  if (bestehend) {
    await prisma.jahresberichtVerifikation.delete({ where: { id: bestehend.id } });
  } else {
    await prisma.jahresberichtVerifikation.create({ data: { mietvertragId, jahr, quartal } });
  }

  revalidatePath("/jahresuebersicht");
  revalidatePath("/quartalsuebersicht");
}

// Kommentar pro Mietvertrag und Jahr bzw. Quartal (0 = Jahr; leer = entfernt).
export async function speichereJahresberichtKommentar(
  mietvertragId: string,
  jahr: number,
  kommentar: string,
  quartal = 0,
) {
  await requireEditor();
  const text = kommentar.trim();
  const where = { mietvertragId_jahr_quartal: { mietvertragId, jahr, quartal } };
  if (!text) {
    await prisma.jahresberichtKommentar.deleteMany({ where: { mietvertragId, jahr, quartal } });
  } else {
    await prisma.jahresberichtKommentar.upsert({
      where,
      create: { mietvertragId, jahr, quartal, kommentar: text },
      update: { kommentar: text },
    });
  }
  revalidatePath("/jahresuebersicht");
  revalidatePath("/quartalsuebersicht");
}

const kontenabgleichSchema = z.object({
  jahr: z.coerce.number().int(),
  quartal: z.coerce.number().int().min(0).max(4).default(0),
  kontostandLautBankauszug: z.coerce.number(),
});

/**
 * Der einzige Bezug zur Realität im Kontenabgleich (siehe ladeKontenabgleich in page.tsx): der
 * dort berechnete Kontostand-Endsaldo rechnet sich nur selbst nach (intern konsistent), erst der
 * Abgleich gegen diesen manuell vom echten Kontoauszug abgelesenen Wert kann eine tatsächlich
 * fehlende oder falsch geflaggte Buchung aufdecken.
 */
export const speichereKontenabgleichVerifikation = mitMeldung(async function speichereKontenabgleichVerifikation(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const parsed = kontenabgleichSchema.safeParse({
    jahr: formData.get("jahr"),
    quartal: formData.get("quartal") ?? 0,
    kontostandLautBankauszug: formData.get("kontostandLautBankauszug"),
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { jahr, quartal, kontostandLautBankauszug } = parsed.data;

  await prisma.kontenabgleichVerifikation.upsert({
    where: { jahr_quartal: { jahr, quartal } },
    update: { kontostandLautBankauszug },
    create: { jahr, quartal, kontostandLautBankauszug },
  });

  revalidatePath("/jahresuebersicht");
  revalidatePath("/quartalsuebersicht");
  return null;
});

export async function loescheKontenabgleichVerifikation(jahr: number, quartal = 0) {
  await requireEditor();
  await prisma.kontenabgleichVerifikation.deleteMany({ where: { jahr, quartal } });
  revalidatePath("/jahresuebersicht");
  revalidatePath("/quartalsuebersicht");
}
