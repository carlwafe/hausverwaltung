"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { storniereBuchung } from "@/lib/buchung-storno";
import { DARLEHEN_BUCHUNGSART, ordneDarlehenZu } from "@/lib/darlehen";
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
  const darlehenId = String(formData.get("darlehenId") ?? "");
  const betrag = parseBetrag(String(formData.get("betrag") ?? ""));
  const bemerkung = String(formData.get("bemerkung") ?? "").trim();
  const monat = (name: string) => {
    const roh = String(formData.get(name) ?? "");
    return roh === "" ? null : Number(roh);
  };
  const vonMonat = monat("vonMonat");
  const bisMonat = monat("bisMonat");
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) throw new AktionsFehler("Ungültiges Jahr.");
  if (!darlehenId) throw new AktionsFehler("Bitte ein Darlehen wählen.");
  if (!Number.isFinite(betrag) || betrag <= 0) throw new AktionsFehler("Der Betrag muss größer als 0 sein.");
  if (bemerkung.length > 200) throw new AktionsFehler("Die Bemerkung ist zu lang (höchstens 200 Zeichen).");
  if ((vonMonat === null) !== (bisMonat === null)) throw new AktionsFehler("Zeitraum: bitte „von“ und „bis“ angeben oder beides leer lassen.");
  if (vonMonat !== null && bisMonat !== null) {
    const ok = [vonMonat, bisMonat].every((m) => Number.isInteger(m) && m >= 1 && m <= 12) && vonMonat <= bisMonat;
    if (!ok) throw new AktionsFehler("Zeitraum: „von“ darf nicht nach „bis“ liegen.");
  }
  const darlehen = await prisma.darlehen.findUnique({ where: { id: darlehenId }, select: { id: true, bezeichnung: true } });
  if (!darlehen) throw new AktionsFehler("Das Darlehen gibt es nicht mehr.");

  const daten = {
    bezeichnung: darlehen.bezeichnung,
    betrag: Math.round(betrag * 100) / 100,
    vonMonat,
    bisMonat,
    bemerkung: bemerkung || null,
    erstelltVon: benutzerLabel(user),
  };
  // Höchstens ein Eintrag je Darlehen und Jahr: ein weiterer Eintrag für dasselbe Darlehen ersetzt den vorhandenen.
  await prisma.schuldzinsenJahreswert.upsert({
    where: { darlehenId_jahr: { darlehenId, jahr } },
    create: { jahr, darlehenId, ...daten },
    update: daten,
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

// Ordnet eine bereits gebuchte Darlehensrate nachträglich einem Darlehen der Stammdaten zu (oder hebt die Zuordnung
// auf). Anker ist die Tilgung der Rate, bei einer reinen Zinsbuchung die Zinsbuchung (siehe DarlehenZuordnung).
export const ordneDarlehensrateZu = mitMeldung(async function ordneDarlehensrateZu(ankerId: string, darlehenId: string) {
  const user = await requireEditor();
  const anker = await prisma.buchung.findUnique({
    where: { id: ankerId },
    select: { buchungsart: { select: { code: true } }, kostenart: { select: { anlageVZeile: true } } },
  });
  const istRate = anker && (anker.buchungsart.code === DARLEHEN_BUCHUNGSART || anker.kostenart?.anlageVZeile === "SCHULDZINSEN");
  if (!istRate) throw new AktionsFehler("Das ist keine Darlehensrate.");
  if (darlehenId) {
    const d = await prisma.darlehen.findUnique({ where: { id: darlehenId }, select: { id: true } });
    if (!d) throw new AktionsFehler("Das Darlehen gibt es nicht mehr.");
  }
  await ordneDarlehenZu(prisma, ankerId, darlehenId || null, benutzerLabel(user));
  revalidatePath("/darlehen");
});
