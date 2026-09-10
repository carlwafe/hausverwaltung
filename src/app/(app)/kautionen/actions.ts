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

function parseOptionalDecimal(raw: FormDataEntryValue | null): number | null | "invalid" {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : "invalid";
}

export async function aktualisiereKaution(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return "Ungültige Kaution.";

  const status = formData.get("status");
  if (status !== "AKTIV" && status !== "AUFGELOEST" && status !== "ZURUECKGEZAHLT") {
    return "Ungültiger Status.";
  }

  const aufloesungsdatumRaw = formData.get("aufloesungsdatum");
  const aufloesungsbetrag = parseOptionalDecimal(formData.get("aufloesungsbetrag"));
  if (aufloesungsbetrag === "invalid") return "Auflösungsbetrag ist keine gültige Zahl.";

  const rueckzahlungsdatumRaw = formData.get("rueckzahlungsdatum");
  const rueckzahlungsbetrag = parseOptionalDecimal(formData.get("rueckzahlungsbetrag"));
  if (rueckzahlungsbetrag === "invalid") return "Rückzahlungsbetrag ist keine gültige Zahl.";

  const notizenRaw = formData.get("notizen");

  await prisma.kaution.update({
    where: { id },
    data: {
      status,
      aufloesungsdatum:
        typeof aufloesungsdatumRaw === "string" && aufloesungsdatumRaw ? new Date(aufloesungsdatumRaw) : null,
      aufloesungsbetrag,
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

// Verrechnung einer Kostenposition (typischerweise eine Reparatur) mit dem einbehaltenen Betrag
// einer Kaution — siehe berechneEffektivEinbehalten in kaution.ts. Ändert nichts an der
// Kostenposition selbst (Kostenart/Betrag/Jahr bleiben für die normale Kostenauswertung
// unverändert), nur die zusätzliche Verknüpfung.
export async function verknuepfeKostenpositionMitKaution(kautionId: string, kostenpositionId: string) {
  await requireEditor();
  await prisma.kostenposition.update({ where: { id: kostenpositionId }, data: { kautionId } });
  revalidatePath("/kautionen");
}

export async function entferneKostenpositionVonKaution(kostenpositionId: string) {
  await requireEditor();
  await prisma.kostenposition.update({ where: { id: kostenpositionId }, data: { kautionId: null } });
  revalidatePath("/kautionen");
}
