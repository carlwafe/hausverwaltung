"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { parseGebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";

const kostenpositionSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  // Optional: manche Kosten (z.B. Bankgebühren, Verwaltungskosten) betreffen das ganze Objekt und
  // lassen sich keinem einzelnen Gebäude zuordnen. Trägt ein "gebaeude:"/"haus:"-Präfix, siehe
  // parseGebaeudeAuswahlWert.
  gebaeudeAuswahl: z.string().optional(),
  jahr: z.coerce.number().int().min(2000).max(2100),
  // Negativ ist ein legitimer Wert (eine Gutschrift/Erstattung eines bekannten Kosten-Empfängers,
  // z.B. eine Techem-Rückerstattung, siehe kosten-import.ts) und mindert die Kostenart — nur 0 ist
  // ungültig. Vorher war hier .positive() gesetzt, wodurch sich eine bereits bestehende Gutschrift
  // gar nicht mehr bearbeiten ließ (z.B. nur die Gebäude-Zuordnung korrigieren), selbst wenn der
  // Betrag selbst unverändert blieb.
  betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
  beschreibung: z.string().optional(),
  empfaenger: z.string().optional(),
  // Verknüpft diese Position als virtuelle Gutschrift mit einer Kautionsbuchung der Kategorie
  // VIRTUELLE_AUSZAHLUNG (Gegenbuchung, siehe Kostenposition.virtuelleKautionBuchungId im Schema).
  virtuelleKautionBuchungId: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = kostenpositionSchema.safeParse({
    kostenartId: formData.get("kostenartId"),
    gebaeudeAuswahl: formData.get("gebaeudeId") || undefined,
    jahr: formData.get("jahr"),
    betrag: formData.get("betrag"),
    beschreibung: formData.get("beschreibung") || undefined,
    empfaenger: formData.get("empfaenger") || undefined,
    virtuelleKautionBuchungId: formData.get("virtuelleKautionBuchungId") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const { gebaeudeAuswahl, ...rest } = parsed.data;
  const { gebaeudeId, hausId, kostengruppeId, einheitId } = parseGebaeudeAuswahlWert(gebaeudeAuswahl ?? "");
  return { ...rest, gebaeudeId, hausId, kostengruppeId, einheitId };
}

// Das Datumsfeld wird bei einer importierten Position deaktiviert (siehe kostenposition-form.tsx)
// — ein deaktiviertes <input> wird beim Absenden gar nicht erst mitgeschickt, `formData.get`
// liefert dann null. Das unterscheidet zuverlässig "Feld war deaktiviert, nicht anfassen" von
// "Feld war leer, Nutzer hat kein Datum eingetragen".
function parseDatumFeld(formData: FormData): { vorhanden: boolean; wert: Date | null } {
  const raw = formData.get("datum");
  if (raw === null) return { vorhanden: false, wert: null };
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return { vorhanden: true, wert: trimmed ? new Date(trimmed) : null };
}

// Eine virtuelle Gutschrift ohne eigenes datum würde nicht in /kontostand einfließen (das dort nur
// Kostenpositionen mit datum != null zählt) und ihre verknüpfte Kautionsbuchung nicht ausgleichen.
// Übernimmt deshalb, falls der Nutzer selbst kein Datum eingetragen hat, automatisch das Datum der
// verknüpften Kautionsbuchung als Vorschlag.
async function ermittleDatumFuerVirtuelleGutschrift(
  virtuelleKautionBuchungId: string | undefined,
): Promise<Date | null> {
  if (!virtuelleKautionBuchungId) return null;
  const buchung = await prisma.kautionBuchung.findUnique({
    where: { id: virtuelleKautionBuchungId },
    select: { datum: true },
  });
  return buchung?.datum ?? null;
}

export async function createKostenposition(formData: FormData) {
  await requireEditor();
  const { kostenartId, gebaeudeId, hausId, kostengruppeId, einheitId, virtuelleKautionBuchungId, ...rest } =
    parseForm(formData);
  const { wert: explizitesDatum } = parseDatumFeld(formData);
  const datum = explizitesDatum ?? (await ermittleDatumFuerVirtuelleGutschrift(virtuelleKautionBuchungId));

  await prisma.kostenposition.create({
    data: {
      ...rest,
      datum,
      kostenart: { connect: { id: kostenartId } },
      ...(gebaeudeId ? { gebaeude: { connect: { id: gebaeudeId } } } : {}),
      ...(hausId ? { haus: { connect: { id: hausId } } } : {}),
      ...(kostengruppeId ? { kostengruppe: { connect: { id: kostengruppeId } } } : {}),
      ...(einheitId ? { einheit: { connect: { id: einheitId } } } : {}),
      ...(virtuelleKautionBuchungId
        ? { virtuelleKautionBuchung: { connect: { id: virtuelleKautionBuchungId } } }
        : {}),
    },
  });

  revalidatePath("/kosten");
  revalidatePath("/kautionen");
  redirect("/kosten");
}

export async function updateKostenposition(id: string, formData: FormData) {
  await requireEditor();
  const { kostenartId, gebaeudeId, hausId, kostengruppeId, einheitId, virtuelleKautionBuchungId, ...rest } =
    parseForm(formData);
  // Bei einer importierten Position (Datumsfeld deaktiviert) war "datum" gar nicht im FormData
  // enthalten — dann bleibt das echte Buchungsdatum unangetastet. Sonst übernimmt ein vom Nutzer
  // eingetragenes Datum immer Vorrang; ist das Feld leer, greift wie beim Anlegen die Vorbelegung
  // aus einer verknüpften Kautionsbuchung, sonst wird das Datum explizit gelöscht.
  const { vorhanden, wert: explizitesDatum } = parseDatumFeld(formData);
  const datum = vorhanden
    ? (explizitesDatum ?? (await ermittleDatumFuerVirtuelleGutschrift(virtuelleKautionBuchungId)))
    : undefined;

  await prisma.kostenposition.update({
    where: { id },
    data: {
      ...rest,
      ...(datum !== undefined ? { datum } : {}),
      kostenart: { connect: { id: kostenartId } },
      gebaeude: gebaeudeId ? { connect: { id: gebaeudeId } } : { disconnect: true },
      haus: hausId ? { connect: { id: hausId } } : { disconnect: true },
      kostengruppe: kostengruppeId ? { connect: { id: kostengruppeId } } : { disconnect: true },
      einheit: einheitId ? { connect: { id: einheitId } } : { disconnect: true },
      virtuelleKautionBuchung: virtuelleKautionBuchungId
        ? { connect: { id: virtuelleKautionBuchungId } }
        : { disconnect: true },
    },
  });

  revalidatePath("/kosten");
  revalidatePath(`/kosten/${id}`);
  revalidatePath("/kautionen");
  redirect("/kosten");
}

export async function deleteKostenposition(id: string) {
  await requireEditor();
  await prisma.kostenposition.delete({ where: { id } });
  revalidatePath("/kosten");
  redirect("/kosten");
}

export async function deleteKostenpositionen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.kostenposition.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/kosten");
}

const aufteilungTeilSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  beschreibung: z.string().optional(),
});

/**
 * Teilt eine als eine Buchung importierte Kostenposition (z.B. eine Hausmeister-Rechnung mit
 * umlagefähigem Hausmeisterdienst + nicht umlagefähigem Winterdienst) in mehrere Positionen mit
 * je eigener Kostenart/Betrag auf. Die ursprüngliche Position wird durch die neuen ersetzt statt
 * daneben zu bestehen — dadurch bleiben alle bestehenden Summen (Nebenkostenabrechnung,
 * Jahresübersicht, Kosten-Übersicht) automatisch korrekt, ohne dass sie von der Aufteilung
 * wissen müssen. `aufteilungGruppeId` verknüpft die neuen Positionen als zusammengehörig, damit
 * die Kosten-Übersicht sie wieder als eine Zeile darstellen kann.
 */
export async function teileKostenpositionAuf(
  id: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("teile");
  if (typeof raw !== "string") return "Keine Aufteilung übermittelt.";

  let teileRoh: unknown;
  try {
    teileRoh = JSON.parse(raw);
  } catch {
    return "Aufteilung konnte nicht gelesen werden.";
  }

  const parsed = z.array(aufteilungTeilSchema).min(2, "Mindestens zwei Positionen nötig").safeParse(teileRoh);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const teile = parsed.data;

  const original = await prisma.kostenposition.findUnique({ where: { id } });
  if (!original) return "Kostenposition nicht gefunden.";

  const summeTeile = teile.reduce((sum, t) => sum + t.betrag, 0);
  if (Math.abs(summeTeile - Number(original.betrag)) > 0.01) {
    return `Die Summe der Teile (${summeTeile.toFixed(2)} €) muss dem Gesamtbetrag (${Number(original.betrag).toFixed(2)} €) entsprechen.`;
  }

  const gruppeId = original.aufteilungGruppeId ?? original.id;

  await prisma.$transaction(async (tx) => {
    const neuePositionen = [];
    for (const teil of teile) {
      const neu = await tx.kostenposition.create({
        data: {
          kostenartId: teil.kostenartId,
          betrag: teil.betrag,
          beschreibung: teil.beschreibung || original.beschreibung,
          empfaenger: original.empfaenger,
          gebaeudeId: original.gebaeudeId,
          hausId: original.hausId,
          kostengruppeId: original.kostengruppeId,
          einheitId: original.einheitId,
          jahr: original.jahr,
          datum: original.datum,
          rohdaten: original.rohdaten ?? undefined,
          importBatchId: original.importBatchId,
          aufteilungGruppeId: gruppeId,
        },
      });
      neuePositionen.push(neu);
    }
    // Belege hängen an der ursprünglichen Position — auf die erste neue Teil-Position umhängen,
    // statt sie beim Löschen der ursprünglichen Position durch die Cascade zu verlieren.
    await tx.dokument.updateMany({
      where: { kostenpositionId: id },
      data: { kostenpositionId: neuePositionen[0].id },
    });
    await tx.kostenposition.delete({ where: { id } });
  });

  revalidatePath("/kosten");
  redirect("/kosten");
}

// Macht eine Aufteilung wieder rückgängig: alle Positionen derselben aufteilungGruppeId werden
// zu einer einzigen Position zusammengeführt (Betrag = Summe), unter der Kostenart der Position,
// von der aus die Aktion aufgerufen wurde. Belege aller Teile wandern auf die neue Position.
export async function hebeAufteilungAuf(positionId: string) {
  await requireEditor();
  const position = await prisma.kostenposition.findUnique({ where: { id: positionId } });
  if (!position) throw new Error("Kostenposition nicht gefunden.");
  if (!position.aufteilungGruppeId) throw new Error("Diese Position ist nicht Teil einer Aufteilung.");

  const gruppe = await prisma.kostenposition.findMany({
    where: { aufteilungGruppeId: position.aufteilungGruppeId },
  });
  const summe = gruppe.reduce((sum, p) => sum + Number(p.betrag), 0);

  await prisma.$transaction(async (tx) => {
    const neu = await tx.kostenposition.create({
      data: {
        kostenartId: position.kostenartId,
        betrag: summe,
        beschreibung: position.beschreibung,
        empfaenger: position.empfaenger,
        gebaeudeId: position.gebaeudeId,
        hausId: position.hausId,
        kostengruppeId: position.kostengruppeId,
        einheitId: position.einheitId,
        jahr: position.jahr,
        datum: position.datum,
        rohdaten: position.rohdaten ?? undefined,
        importBatchId: position.importBatchId,
      },
    });
    await tx.dokument.updateMany({
      where: { kostenpositionId: { in: gruppe.map((p) => p.id) } },
      data: { kostenpositionId: neu.id },
    });
    await tx.kostenposition.deleteMany({ where: { aufteilungGruppeId: position.aufteilungGruppeId } });
  });

  revalidatePath("/kosten");
  redirect("/kosten");
}

const nichtZugeordneteBuchungZuordnenSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  gebaeudeAuswahl: z.string().optional(),
  jahr: z.coerce.number().int().min(2000).max(2100),
});

// Löst eine geparkte NichtZugeordneteBuchung (siehe kontoauszug/import/actions.ts,
// parkeAlsNichtKategorisiert) auf: legt daraus eine echte Kostenposition an — Datum/Betrag/
// Empfänger/Rohdaten/importBatchId werden 1:1 von der geparkten Buchung übernommen, nur
// Kostenart/Gebäude/Jahr kommen aus dem Formular — und löscht danach die Parkplatz-Zeile.
export async function ordneNichtZugeordneteBuchungZu(
  id: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const parsed = nichtZugeordneteBuchungZuordnenSchema.safeParse({
    kostenartId: formData.get("kostenartId"),
    gebaeudeAuswahl: formData.get("gebaeudeAuswahl") || undefined,
    jahr: formData.get("jahr"),
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { kostenartId, gebaeudeAuswahl, jahr } = parsed.data;
  const { gebaeudeId, hausId, kostengruppeId, einheitId } = parseGebaeudeAuswahlWert(gebaeudeAuswahl ?? "");

  const buchung = await prisma.nichtZugeordneteBuchung.findUnique({ where: { id } });
  if (!buchung) return "Diese Buchung wurde bereits zugeordnet oder gelöscht.";

  await prisma.$transaction([
    prisma.kostenposition.create({
      data: {
        kostenartId,
        gebaeudeId,
        hausId,
        kostengruppeId,
        einheitId,
        jahr,
        datum: buchung.datum,
        betrag: buchung.betrag,
        empfaenger: buchung.empfaenger,
        beschreibung: buchung.verwendungszweck,
        rohdaten: buchung.rohdaten ?? undefined,
        importBatchId: buchung.importBatchId,
      },
    }),
    prisma.nichtZugeordneteBuchung.delete({ where: { id } }),
  ]);

  revalidatePath("/kosten");
  return null;
}

export async function loescheNichtZugeordneteBuchung(id: string) {
  await requireEditor();
  await prisma.nichtZugeordneteBuchung.delete({ where: { id } });
  revalidatePath("/kosten");
}
