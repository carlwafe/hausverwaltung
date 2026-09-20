"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { storniereBuchung } from "@/lib/buchung-storno";
import { ermittleBuchungsartGruppe } from "@/lib/import/buchung-klassifizierung";

// Umbuchung: die Buchung wird storniert und mit anderer Buchungsart neu angelegt (Storno-Prinzip —
// das Original bleibt als stornierter Datensatz nachvollziehbar). Die Rohdaten der Bankzeile und
// der Import-Bezug wandern mit; bezugTyp "Umbuchung" verweist auf die ursprüngliche Buchung, damit
// die Bereits-importiert-Erkennung und die Vollständigkeitsprüfung die Bankzeile weiter als
// erledigt erkennen (siehe ladeDedupFilter in kontoauszug/import/actions.ts).
export async function aendereBuchungsart(
  id: string,
  rueckPfad: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const zielCode = String(formData.get("zielCode") ?? "");
  const mietvertragId = String(formData.get("mietvertragId") ?? "") || null;
  const kostenartId = String(formData.get("kostenartId") ?? "") || null;
  const periodeMonat = Number(formData.get("periodeMonat")) || null;
  const periodeJahr = Number(formData.get("periodeJahr")) || null;
  const jahr = Number(formData.get("jahr")) || null;

  const original = await prisma.buchung.findUnique({
    where: { id },
    include: { buchungsart: true, storniertZeile: { select: { id: true } } },
  });
  if (!original) return "Buchung nicht gefunden.";
  if (original.storniertDurchBuchungId || original.storniertZeile) return "Diese Buchung ist bereits storniert.";
  if (!original.buchungsart.zahlungswirksam) return "Nur Buchungen mit echtem Geldfluss lassen sich umbuchen.";
  if (original.bezugTyp && original.bezugTyp !== "Umbuchung") {
    return "Diese Buchung ist mit einer anderen Buchung verknüpft (z.B. Kaution-Einbehalt oder virtuelle Gegenbuchung) und kann nicht umgebucht werden.";
  }

  const ziel = await prisma.buchungsart.findUnique({ where: { code: zielCode } });
  if (!ziel || !ziel.aktiv || !ziel.zahlungswirksam) return "Bitte eine gültige Ziel-Buchungsart wählen.";
  if (ziel.id === original.buchungsartId) return "Die Buchung hat bereits diese Buchungsart.";

  const gruppe = ermittleBuchungsartGruppe(ziel.code);
  if ((gruppe === "MIETE" || gruppe === "SONDERZAHLUNG") && !mietvertragId) return "Bitte einen Mietvertrag wählen.";
  if (gruppe === "MIETE" && (!periodeMonat || !periodeJahr)) return "Bitte Monat und Jahr der Miete angeben.";
  if (gruppe === "KOSTEN" && !kostenartId) return "Bitte eine Kostenart wählen.";

  // Kostenpositionen tragen das umgekehrte Vorzeichen (positiv = Ausgabe) — beim Wechsel von/zu
  // Kosten muss der Bankbetrag deshalb gedreht werden.
  const vonKosten = original.buchungsart.code === "KOSTENPOSITION";
  const zuKosten = ziel.code === "KOSTENPOSITION";
  const betrag = Number(original.betrag) * (vonKosten !== zuKosten ? -1 : 1);
  const datum = original.datum;
  if (!datum) return "Die Buchung hat kein Datum und kann nicht umgebucht werden.";

  const neu = await prisma.$transaction(async (tx) => {
    const angelegt = await tx.buchung.create({
      data: {
        buchungsartId: ziel.id,
        mietvertragId: gruppe === "KOSTEN" || gruppe === "MIETWEITERLEITUNG" ? null : mietvertragId,
        kostenartId: gruppe === "KOSTEN" ? kostenartId : null,
        periodeMonat: gruppe === "MIETE" ? periodeMonat : null,
        periodeJahr: gruppe === "MIETE" ? periodeJahr : null,
        jahr: gruppe === "KOSTEN" ? (jahr ?? datum.getFullYear()) : gruppe === "NEBENKOSTENAUSGLEICH" ? jahr : null,
        datum,
        betrag,
        empfaenger: original.empfaenger,
        verwendungszweck: original.verwendungszweck,
        rohdaten: original.rohdaten ?? undefined,
        importBatchId: original.importBatchId,
        bezugTyp: "Umbuchung",
        bezugId: original.bezugTyp === "Umbuchung" ? original.bezugId : original.id,
      },
    });
    // Belege gehören zur Buchung, nicht zum Journal — sie ziehen auf die neue Buchung um.
    await tx.dokument.updateMany({ where: { buchungId: id }, data: { buchungId: angelegt.id } });
    await storniereBuchung(tx, id);
    return angelegt;
  });

  for (const pfad of [
    "/zahlungen",
    "/kosten",
    "/offene-posten",
    "/kontostand",
    "/jahresuebersicht",
    "/kautionen",
    "/mietweiterleitungen",
    "/nebenkostenausgleich",
    "/kontoauszug/importe",
    "/mietvertraege",
    "/",
  ]) {
    revalidatePath(pfad);
  }
  if (neu.mietvertragId) revalidatePath(`/mietvertraege/${neu.mietvertragId}`);
  redirect(rueckPfad);
}
