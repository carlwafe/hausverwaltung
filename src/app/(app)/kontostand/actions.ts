"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { parseCamtDateien } from "@/lib/import/camt";
import { speichereKontosalden } from "@/lib/kontosalden";

export type SaldenErgebnis = { ok: boolean; meldung: string } | null;

// Liest nur die Salden aus CAMT-XML-Dateien ein (ohne etwas zu buchen) — für Auszüge, die schon importiert
// wurden, bevor die Salden gespeichert wurden. Derselbe Tag wird überschrieben.
export async function leseKontosaldenAusXml(_prev: SaldenErgebnis, formData: FormData): Promise<SaldenErgebnis> {
  await requireEditor();
  const dateien = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (dateien.length === 0) return { ok: false, meldung: "Bitte mindestens eine CAMT-Datei (.xml) auswählen." };
  if (dateien.some((f) => !f.name.toLowerCase().endsWith(".xml"))) {
    return { ok: false, meldung: "Es werden nur CAMT-Dateien (.xml) unterstützt." };
  }
  try {
    const camt = parseCamtDateien(
      await Promise.all(dateien.map(async (f) => ({ name: f.name, text: new TextDecoder("utf-8").decode(await f.arrayBuffer()) }))),
    );
    const anzahl = await speichereKontosalden(camt.pruefung, `Salden aus ${dateien.length} Datei${dateien.length === 1 ? "" : "en"}`);
    revalidatePath("/kontostand");
    const hinweis = camt.pruefung.probleme.filter((p) => /Anfangssaldo|Saldokette/.test(p));
    return {
      ok: true,
      meldung:
        `${anzahl} Tagessaldo${anzahl === 1 ? "" : "en"} übernommen.` +
        (hinweis.length > 0 ? ` Achtung: ${hinweis.join(" ")}` : ""),
    };
  } catch (err) {
    return { ok: false, meldung: err instanceof Error ? err.message : "Die Dateien konnten nicht gelesen werden." };
  }
}
