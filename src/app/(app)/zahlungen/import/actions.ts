"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { parseSpreadsheetFile } from "@/lib/import/spreadsheet";
import {
  mapZahlungenRows,
  type ParsedZahlungRow,
  type MietvertragKandidat,
} from "@/lib/import/zahlungen-import";

export type PreviewResult =
  | {
      rows: ParsedZahlungRow[];
      kandidaten: { id: string; label: string }[];
      bestehendeZahlungen: string[];
      fileName: string;
    }
  | { error: string };

export async function previewImport(
  _prev: PreviewResult | null,
  formData: FormData,
): Promise<PreviewResult> {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Bitte eine Datei auswählen." };
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return { error: "Nur .csv, .xlsx oder .xls Dateien werden unterstützt." };
  }

  try {
    const { headers, rows } = await parseSpreadsheetFile(file);
    if (rows.length === 0) {
      return { error: "Keine Datenzeilen in der Datei gefunden." };
    }

    const vertraege = await prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      include: { einheit: true, mieter: true, zahlungen: true },
    });

    const kandidaten: MietvertragKandidat[] = vertraege.map((v) => ({
      id: v.id,
      label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
      warmmiete: Number(v.kaltmiete) + Number(v.nebenkostenVorauszahlung),
      namen: v.mieter.flatMap((m) => [m.vorname, m.nachname]),
      einheitBezeichnung: v.einheit.bezeichnung,
      beginn: v.beginn.toISOString().slice(0, 10),
      ende: v.ende ? v.ende.toISOString().slice(0, 10) : null,
    }));

    const mapped = mapZahlungenRows(headers, rows, kandidaten);

    const bestehendeZahlungen = new Set(
      vertraege.flatMap((v) =>
        v.zahlungen.map(
          (z) => `${v.id}|${z.datum.toISOString().slice(0, 10)}|${Number(z.betrag).toFixed(2)}`,
        ),
      ),
    );

    return {
      rows: mapped,
      kandidaten: kandidaten.map((k) => ({ id: k.id, label: k.label })),
      bestehendeZahlungen: [...bestehendeZahlungen],
      fileName: file.name,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Fehler beim Lesen der Datei: ${err.message}`
          : "Unbekannter Fehler beim Lesen der Datei.",
    };
  }
}

type CommitRow = {
  mietvertragId: string;
  datum: string;
  betrag: number;
  periodeMonat: number;
  periodeJahr: number;
  verwendungszweck: string;
};

export async function commitImport(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireUser();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  let rows: CommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Zahlungen zum Importieren ausgewählt.";

  const existing = await prisma.zahlung.findMany({
    where: { mietvertragId: { in: [...new Set(rows.map((r) => r.mietvertragId))] } },
  });
  const existingSet = new Set(
    existing.map(
      (z) => `${z.mietvertragId}|${z.datum.toISOString().slice(0, 10)}|${Number(z.betrag).toFixed(2)}`,
    ),
  );

  const neu = rows.filter(
    (r) => !existingSet.has(`${r.mietvertragId}|${r.datum}|${r.betrag.toFixed(2)}`),
  );
  const uebersprungen = rows.length - neu.length;

  if (neu.length > 0) {
    await prisma.zahlung.createMany({
      data: neu.map((r) => ({
        mietvertragId: r.mietvertragId,
        datum: new Date(r.datum),
        betrag: r.betrag,
        periodeMonat: r.periodeMonat,
        periodeJahr: r.periodeJahr,
        verwendungszweck: r.verwendungszweck || null,
      })),
    });
  }

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath("/");

  return `${neu.length} Zahlung(en) importiert.${
    uebersprungen > 0 ? ` ${uebersprungen} als Duplikat übersprungen.` : ""
  }`;
}
