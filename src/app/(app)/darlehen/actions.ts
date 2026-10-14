"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { storniereBuchung } from "@/lib/buchung-storno";
import { mitMeldung } from "@/lib/aktion";

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
