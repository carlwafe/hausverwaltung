"use server";

import { z } from "zod";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { mitMeldung } from "@/lib/aktion";
import { parseCamtDateien } from "@/lib/import/camt";
import { speichereKontosalden } from "@/lib/kontosalden";

const kontrolleSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum angeben"),
  betrag: z.coerce.number({ message: "Bitte den Kontostand angeben" }),
  notiz: z.string().optional(),
});

// Kontostand laut Kontoauszug an einem Tag als Kontrollpunkt speichern; pro Tag ein Wert, ein
// erneutes Speichern überschreibt ihn.
export const speichereKontostandKontrolle = mitMeldung(async function speichereKontostandKontrolle(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();
  const parsed = kontrolleSchema.safeParse({
    datum: formData.get("datum"),
    betrag: String(formData.get("betrag") ?? "").replace(",", "."),
    notiz: formData.get("notiz") || undefined,
  });
  if (!parsed.success) return parsed.error.issues.map((i) => i.message).join(", ");

  const datum = parseStrengesDatum(parsed.data.datum);
  if (!datum) return "Ungültiges Datum (z.B. 31.02. gibt es nicht)";
  await prisma.kontostandKontrolle.upsert({
    where: { datum },
    update: { betrag: parsed.data.betrag, notiz: parsed.data.notiz ?? null },
    create: { datum, betrag: parsed.data.betrag, notiz: parsed.data.notiz ?? null },
  });
  revalidatePath("/kontostand");
  return null;
});

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

export async function loescheKontostandKontrolle(id: string) {
  await requireEditor();
  await prisma.kontostandKontrolle.delete({ where: { id } });
  revalidatePath("/kontostand");
}
