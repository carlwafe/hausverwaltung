"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { storniereBuchung } from "@/lib/buchung-storno";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";

// Löscht eine Darlehensrate: storniert die Tilgung; der verknüpfte Zinsanteil (Kostenposition) wird von
// storniereBuchung mitstorniert. Die Bankzeile bleibt im Kontoauszug-Import danach wieder frei.
export const loescheDarlehensrate = mitMeldung(async function loescheDarlehensrate(tilgungId: string) {
  const user = await requireEditor();
  await prisma.$transaction(async (tx) => {
    await storniereBuchung(tx, tilgungId, benutzerLabel(user));
  });
  revalidatePath("/darlehen");
  revalidatePath("/kosten");
  revalidatePath("/kontostand");
  revalidatePath("/jahresuebersicht");
});

// Jahreswerte der Schuldzinsen von anderen Konten (laut Bankbescheinigung) — kein Journal, deshalb ändern/löschen
// ohne Storno. Sie gehen nur in die „Aufstellung für die Steuererklärung“ (siehe SchuldzinsenJahreswert im Schema).
function parseBetrag(text: string): number {
  const t = text.trim().replace(/\s/g, "");
  const zahl = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return zahl;
}

export const speichereSchuldzinsenJahreswert = mitMeldung(async function speichereSchuldzinsenJahreswert(formData: FormData) {
  const user = await requireEditor();
  const jahr = Number(formData.get("jahr"));
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  const betrag = parseBetrag(String(formData.get("betrag") ?? ""));
  const bemerkung = String(formData.get("bemerkung") ?? "").trim();
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) throw new AktionsFehler("Ungültiges Jahr.");
  if (!bezeichnung) throw new AktionsFehler("Bitte eine Bezeichnung angeben (z.B. das Darlehen).");
  if (bezeichnung.length > 100) throw new AktionsFehler("Die Bezeichnung ist zu lang (höchstens 100 Zeichen).");
  if (!Number.isFinite(betrag) || betrag <= 0) throw new AktionsFehler("Der Betrag muss größer als 0 sein.");
  if (bemerkung.length > 200) throw new AktionsFehler("Die Bemerkung ist zu lang (höchstens 200 Zeichen).");
  await prisma.schuldzinsenJahreswert.create({
    data: { jahr, bezeichnung, betrag: Math.round(betrag * 100) / 100, bemerkung: bemerkung || null, erstelltVon: benutzerLabel(user) },
  });
  revalidatePath("/darlehen");
  revalidatePath("/jahresuebersicht");
});

export const loescheSchuldzinsenJahreswert = mitMeldung(async function loescheSchuldzinsenJahreswert(id: string) {
  await requireEditor();
  await prisma.schuldzinsenJahreswert.deleteMany({ where: { id } });
  revalidatePath("/darlehen");
  revalidatePath("/jahresuebersicht");
});
