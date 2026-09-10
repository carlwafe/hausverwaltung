"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

export async function deleteKautionsbuchungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.kautionBuchung.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/kautionen");
}

export async function aktualisiereKaution(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return "Ungültige Kaution.";

  const status = formData.get("status");
  if (status !== "AKTIV" && status !== "ZURUECKGEZAHLT") return "Ungültiger Status.";

  const rueckzahlungsdatumRaw = formData.get("rueckzahlungsdatum");
  const rueckzahlungsbetragRaw = formData.get("rueckzahlungsbetrag");
  const notizenRaw = formData.get("notizen");

  const rueckzahlungsbetrag =
    typeof rueckzahlungsbetragRaw === "string" && rueckzahlungsbetragRaw.trim() !== ""
      ? Number(rueckzahlungsbetragRaw.replace(",", "."))
      : null;
  if (rueckzahlungsbetrag !== null && !Number.isFinite(rueckzahlungsbetrag)) {
    return "Rückzahlungsbetrag ist keine gültige Zahl.";
  }

  await prisma.kaution.update({
    where: { id },
    data: {
      status,
      rueckzahlungsdatum:
        typeof rueckzahlungsdatumRaw === "string" && rueckzahlungsdatumRaw
          ? new Date(rueckzahlungsdatumRaw)
          : null,
      rueckzahlungsbetrag,
      notizen: typeof notizenRaw === "string" && notizenRaw.trim() !== "" ? notizenRaw.trim() : null,
    },
  });

  revalidatePath("/kautionen");
  return "Gespeichert.";
}
