"use server";

import { revalidatePath } from "next/cache";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";
import { MAX_DOKUMENT_GROESSE_BYTES } from "@/lib/upload-limits";
import { speichereDatei, loescheDatei } from "@/lib/storage";

type UploadZiel =
  | { buchungId: string; revalidatePath: string }
  | { mietvertragId: string; revalidatePath: string }
  | { einheitId: string; revalidatePath: string }
  | { dienstleisterId: string; revalidatePath: string }
  | { ticketId: string; revalidatePath: string }
  // Allgemeines Dokument ohne Bezug, nur über einen frei benannten Ordner einsortiert.
  | { ordner: string | null; revalidatePath: string };

// "YYYY-MM-DD" aus einem Datumsfeld als UTC-Mitternacht (wie alle Datumswerte der App); leer/ungültig
// = kein Belegdatum.
function parseBelegDatum(wert: FormDataEntryValue | string | null): Date | null {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  return parseStrengesDatum(wert);
}

// Das "file"-Feld kann mehrfach vorkommen (z.B. mehrere Einheit-Fotos auf einmal, siehe
// FotosSektion) — hier bewusst per getAll statt get, damit ein- und mehrteilige Uploads
// dieselbe Action nutzen können.
export const uploadDokument = mitMeldung(async function uploadDokument(
  ziel: UploadZiel,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireEditor();

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return "Bitte eine Datei auswählen.";
  }

  // Optionales Belegdatum (Datum des Belegs selbst), gilt für alle Dateien dieses Uploads.
  const belegDatum = parseBelegDatum(formData.get("belegDatum"));

  for (const file of files) {
    const speicherpfad = await speichereDatei(Buffer.from(await file.arrayBuffer()), file.name);
    await prisma.dokument.create({
      data: {
        dateiname: file.name,
        speicherpfad,
        mimeType: file.type || null,
        groesseBytes: file.size,
        buchungId: "buchungId" in ziel ? ziel.buchungId : undefined,
        mietvertragId: "mietvertragId" in ziel ? ziel.mietvertragId : undefined,
        einheitId: "einheitId" in ziel ? ziel.einheitId : undefined,
        dienstleisterId: "dienstleisterId" in ziel ? ziel.dienstleisterId : undefined,
        ticketId: "ticketId" in ziel ? ziel.ticketId : undefined,
        ordner: "ordner" in ziel ? ziel.ordner : undefined,
        hochgeladenVon: user.email ?? user.name ?? null,
        belegDatum,
      },
    });
  }

  revalidatePath(ziel.revalidatePath);
  revalidatePath("/dokumente");
  return null;
});

export async function deleteDokument(id: string, revalidatePathValue: string): Promise<void> {
  await requireEditor();

  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) return;

  await prisma.dokument.delete({ where: { id } });
  await loescheDatei(dokument.speicherpfad);
  revalidatePath(revalidatePathValue);
  revalidatePath("/dokumente");
}

export async function aendereBelegDatum(id: string, datum: string, revalidatePathValue: string): Promise<void> {
  await requireEditor();
  await prisma.dokument.update({ where: { id }, data: { belegDatum: parseBelegDatum(datum) } });
  revalidatePath(revalidatePathValue);
  revalidatePath("/dokumente");
}

const ZENTRAL_BEREICHE = ["mietvertraege", "einheiten", "dienstleister", "tickets", "allgemein"] as const;

// Upload von der Seite /dokumente: Bereich + Bezug kommen aus dem Formular. Je Upload nur eine
// Datei (4-MB-Limit wegen Vercels Request-Größe, siehe upload-limits.ts).
export const uploadDokumentZentral = mitMeldung(async function uploadDokumentZentral(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();
  const bereich = formData.get("bereich");
  const bezugId = String(formData.get("bezugId") ?? "");
  const ordner = String(formData.get("ordner") ?? "").trim();
  if (!ZENTRAL_BEREICHE.some((b) => b === bereich)) throw new AktionsFehler("Bitte einen Bereich wählen.");

  const datei = formData.get("file");
  if (datei instanceof File && datei.size > MAX_DOKUMENT_GROESSE_BYTES) {
    throw new AktionsFehler(`Die Datei darf maximal ${MAX_DOKUMENT_GROESSE_BYTES / (1024 * 1024)} MB groß sein.`);
  }

  let ziel: UploadZiel;
  if (bereich === "allgemein") {
    if (ordner.length > 80) throw new AktionsFehler("Der Ordnername darf höchstens 80 Zeichen lang sein.");
    ziel = { ordner: ordner || null, revalidatePath: "/dokumente" };
  } else {
    if (!bezugId) throw new AktionsFehler("Bitte auswählen, wo das Dokument abgelegt werden soll.");
    // Existenz prüfen, damit kein Dokument mit ungültigem Fremdschlüssel (generische Fehlermeldung) entsteht.
    const vorhanden =
      bereich === "mietvertraege"
        ? await prisma.mietvertrag.findUnique({ where: { id: bezugId }, select: { id: true } })
        : bereich === "einheiten"
          ? await prisma.einheit.findUnique({ where: { id: bezugId }, select: { id: true } })
          : bereich === "dienstleister"
            ? await prisma.dienstleister.findUnique({ where: { id: bezugId }, select: { id: true } })
            : await prisma.ticket.findUnique({ where: { id: bezugId }, select: { id: true } });
    if (!vorhanden) throw new AktionsFehler("Die Auswahl existiert nicht mehr.");
    ziel =
      bereich === "mietvertraege"
        ? { mietvertragId: bezugId, revalidatePath: "/dokumente" }
        : bereich === "einheiten"
          ? { einheitId: bezugId, revalidatePath: "/dokumente" }
          : bereich === "dienstleister"
            ? { dienstleisterId: bezugId, revalidatePath: "/dokumente" }
            : { ticketId: bezugId, revalidatePath: "/dokumente" };
  }

  const fehler = await uploadDokument(ziel, null, formData);
  if (fehler) throw new AktionsFehler(fehler);
  // Die Detailseite des Bezugs zeigt das Dokument ebenfalls.
  if (bereich !== "allgemein") {
    const pfad = { mietvertraege: "mietvertraege", einheiten: "einheiten", dienstleister: "dienstleister", tickets: "tickets" }[
      bereich as "mietvertraege" | "einheiten" | "dienstleister" | "tickets"
    ];
    revalidatePath(`/${pfad}/${bezugId}`);
  }
  return null;
});

// Ordner eines allgemeinen Dokuments ändern (leer = „Ohne Ordner“). Mit Bezug gibt es keinen Ordner.
export async function aendereOrdner(id: string, ordner: string): Promise<void> {
  await requireEditor();
  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument || dokument.buchungId || dokument.mietvertragId || dokument.einheitId || dokument.dienstleisterId || dokument.ticketId) return;
  await prisma.dokument.update({ where: { id }, data: { ordner: ordner.trim().slice(0, 80) || null } });
  revalidatePath("/dokumente");
}
