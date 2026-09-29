"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { loescheDatei } from "@/lib/storage";
import { optionalesDatum } from "@/lib/zod-datum";
import { kategorieLabel, prioritaetLabel, statusLabel } from "@/lib/ticket";

const leerAlsNull = (v: FormDataEntryValue | null) => (typeof v === "string" && v !== "" ? v : null);

const ticketSchema = z.object({
  titel: z.string().trim().min(1, "Titel ist erforderlich"),
  beschreibung: z.string().trim().optional(),
  status: z.enum(["OFFEN", "IN_BEARBEITUNG", "WARTET", "ERLEDIGT"]),
  prioritaet: z.enum(["NIEDRIG", "NORMAL", "HOCH", "DRINGEND"]),
  kategorie: z.enum(["MANGEL_REPARATUR", "MIETERANFRAGE", "AUFGABE", "BUCHHALTUNG", "SONSTIGES"]),
  faelligAm: optionalesDatum(),
});

async function parseForm(formData: FormData) {
  const parsed = ticketSchema.safeParse({
    titel: formData.get("titel"),
    beschreibung: formData.get("beschreibung") || undefined,
    status: formData.get("status") ?? "OFFEN",
    prioritaet: formData.get("prioritaet") ?? "NORMAL",
    kategorie: formData.get("kategorie") ?? "MANGEL_REPARATUR",
    faelligAm: formData.get("faelligAm") ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const d = parsed.data;

  let einheitId = leerAlsNull(formData.get("einheitId"));
  const mietvertragId = leerAlsNull(formData.get("mietvertragId"));
  // Ein Mietvertrag legt die Einheit fest — verhindert widersprüchliche Bezüge.
  if (mietvertragId) {
    const vertrag = await prisma.mietvertrag.findUnique({ where: { id: mietvertragId }, select: { einheitId: true } });
    if (!vertrag) throw new Error("Mietvertrag nicht gefunden");
    if (einheitId && einheitId !== vertrag.einheitId) {
      throw new Error("Der gewählte Mietvertrag gehört zu einer anderen Einheit");
    }
    einheitId = vertrag.einheitId;
  }

  return {
    titel: d.titel,
    beschreibung: d.beschreibung ?? null,
    status: d.status,
    prioritaet: d.prioritaet,
    kategorie: d.kategorie,
    faelligAm: d.faelligAm ?? null,
    erledigtAm: d.status === "ERLEDIGT" ? new Date() : null,
    einheitId,
    mietvertragId,
    gebaeudeId: leerAlsNull(formData.get("gebaeudeId")),
    hausId: leerAlsNull(formData.get("hausId")),
    dienstleisterId: leerAlsNull(formData.get("dienstleisterId")),
    zugewiesenAnId: leerAlsNull(formData.get("zugewiesenAnId")),
  };
}

const benutzerName = (u: { name: string | null; email: string } | null | undefined) =>
  u ? (u.name ?? u.email) : "niemand";

function revalidiere(bezuege: { einheitId?: string | null; mietvertragId?: string | null; dienstleisterId?: string | null }) {
  revalidatePath("/tickets");
  revalidatePath("/");
  if (bezuege.einheitId) revalidatePath(`/einheiten/${bezuege.einheitId}`);
  if (bezuege.mietvertragId) revalidatePath(`/mietvertraege/${bezuege.mietvertragId}`);
  if (bezuege.dienstleisterId) revalidatePath(`/dienstleister/${bezuege.dienstleisterId}`);
}

export async function createTicket(formData: FormData) {
  const user = await requireEditor();
  const data = await parseForm(formData);
  const ticket = await prisma.ticket.create({
    data: { ...data, erstelltVonId: user.id },
  });
  revalidiere(data);
  redirect(`/tickets/${ticket.id}`);
}

export async function updateTicket(id: string, formData: FormData) {
  const user = await requireEditor();
  const data = await parseForm(formData);
  const alt = await prisma.ticket.findUnique({
    where: { id },
    include: { zugewiesenAn: { select: { name: true, email: true } } },
  });
  if (!alt) throw new Error("Ticket nicht gefunden");

  // Ein bereits erledigtes Ticket behält sein ursprüngliches Erledigt-Datum.
  const erledigtAm = data.status === "ERLEDIGT" ? (alt.erledigtAm ?? new Date()) : null;

  const neuerZustaendiger = data.zugewiesenAnId
    ? await prisma.user.findUnique({ where: { id: data.zugewiesenAnId }, select: { name: true, email: true } })
    : null;

  // Änderungen an Status/Priorität/Kategorie/Zuständigkeit landen automatisch im Verlauf.
  const eintraege: string[] = [];
  if (alt.status !== data.status) eintraege.push(`Status: ${statusLabel(alt.status)} → ${statusLabel(data.status)}`);
  if (alt.prioritaet !== data.prioritaet) {
    eintraege.push(`Priorität: ${prioritaetLabel(alt.prioritaet)} → ${prioritaetLabel(data.prioritaet)}`);
  }
  if (alt.kategorie !== data.kategorie) {
    eintraege.push(`Kategorie: ${kategorieLabel(alt.kategorie)} → ${kategorieLabel(data.kategorie)}`);
  }
  if (alt.zugewiesenAnId !== data.zugewiesenAnId) {
    eintraege.push(`Zuständig: ${benutzerName(alt.zugewiesenAn)} → ${benutzerName(neuerZustaendiger)}`);
  }

  await prisma.ticket.update({
    where: { id },
    data: {
      ...data,
      erledigtAm,
      kommentare: {
        create: eintraege.map((text) => ({ text, system: true, autor: user.name ?? user.email ?? null })),
      },
    },
  });
  revalidiere({ ...alt, ...data });
  revalidatePath(`/tickets/${id}`);
}

export async function deleteTicket(id: string) {
  await requireEditor();
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: { dokumente: true } });
  if (!ticket) redirect("/tickets");
  await prisma.ticket.delete({ where: { id } });
  for (const d of ticket.dokumente) await loescheDatei(d.speicherpfad);
  revalidiere(ticket);
  redirect("/tickets");
}

// Kosten (KOSTENPOSITION-Buchungen) mit einem Ticket verknüpfen bzw. wieder lösen. Die Buchung selbst
// bleibt unangetastet (unveränderlich) — die Verknüpfung liegt in ticket_kosten.
export async function verknuepfeKosten(ticketId: string, buchungId: string): Promise<string | null> {
  await requireEditor();
  if (!buchungId) return "Bitte eine Kostenposition auswählen.";
  const buchung = await prisma.buchung.findUnique({
    where: { id: buchungId },
    select: { buchungsart: { select: { code: true } } },
  });
  if (buchung?.buchungsart.code !== "KOSTENPOSITION") return "Nur Kostenpositionen lassen sich verknüpfen.";
  await prisma.ticketKosten.upsert({
    where: { ticketId_buchungId: { ticketId, buchungId } },
    create: { ticketId, buchungId },
    update: {},
  });
  revalidatePath(`/tickets/${ticketId}`);
  return null;
}

export async function loeseKosten(ticketId: string, buchungId: string): Promise<void> {
  await requireEditor();
  await prisma.ticketKosten.deleteMany({ where: { ticketId, buchungId } });
  revalidatePath(`/tickets/${ticketId}`);
}

export async function addKommentar(ticketId: string, _prev: string | null, formData: FormData): Promise<string | null> {
  const user = await requireEditor();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return "Bitte einen Text eingeben.";
  await prisma.ticketKommentar.create({
    data: { ticketId, text, autor: user.name ?? user.email ?? null },
  });
  revalidatePath(`/tickets/${ticketId}`);
  return null;
}
