"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";
import { ladeEinzugslauf } from "@/lib/lastschrift-einzug";

/**
 * Merkt die aktuell berechnete Datei (Mietmonat, Termin, Ausnahmen wie in der Vorschau) als bei der Bank eingereicht.
 * Spätere Dateien desselben Monats lassen diese Verträge aus (Schutz vor Doppeleinzug). Rechnet die Datei neu, damit
 * der Merker genau den Verträgen entspricht, die dort stehen.
 */
export const markiereEingereicht = mitMeldung(async function markiereEingereicht(formData: FormData): Promise<string | null> {
  const user = await requireEditor();
  const m = /^(\d{4})-(\d{2})$/.exec(String(formData.get("monat") ?? ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new AktionsFehler("Ungültiger Monat.");
  const datum = String(formData.get("datum") ?? "") || null;
  const ohne = formData.getAll("ohne").map(String).filter(Boolean);

  const lauf = await ladeEinzugslauf({ jahr: Number(m[1]), monat: Number(m[2]), faelligAm: datum, ohne });
  if (lauf.anzahl === 0 || !lauf.xml) throw new AktionsFehler("Keine Einzüge in der Datei — es gibt nichts zu markieren.");

  await prisma.lastschriftEinreichung.create({
    data: {
      jahr: lauf.jahr,
      monat: lauf.monat,
      faelligAm: new Date(`${lauf.faelligAm}T00:00:00Z`),
      anzahl: lauf.anzahl,
      summeCent: lauf.summeCent,
      vertragIds: lauf.vertragIds,
      erstelltVon: benutzerLabel(user),
    },
  });
  revalidatePath("/lastschrift-einzug");
  return null;
});

/** Nimmt einen Merker zurück (z.B. wenn die Bank die Datei abgelehnt hat oder er versehentlich gesetzt wurde). */
export const entferneEinreichung = mitMeldung(async function entferneEinreichung(id: string): Promise<string | null> {
  await requireEditor();
  const geloescht = await prisma.lastschriftEinreichung.deleteMany({ where: { id } });
  if (geloescht.count === 0) throw new AktionsFehler("Der Merker existiert nicht mehr.");
  revalidatePath("/lastschrift-einzug");
  return null;
});
