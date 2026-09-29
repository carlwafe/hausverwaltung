import type { TicketKategorie, TicketPrioritaet, TicketStatus } from "@/generated/prisma/client";

export const TICKET_STATUS: { value: TicketStatus; label: string; farbe: string }[] = [
  { value: "OFFEN", label: "Offen", farbe: "bg-blue-500/10 text-blue-400" },
  { value: "IN_BEARBEITUNG", label: "In Bearbeitung", farbe: "bg-amber-500/10 text-amber-400" },
  { value: "WARTET", label: "Wartet", farbe: "bg-purple-500/10 text-purple-400" },
  { value: "ERLEDIGT", label: "Erledigt", farbe: "bg-green-500/10 text-green-400" },
];

export const TICKET_PRIORITAET: { value: TicketPrioritaet; label: string; farbe: string }[] = [
  { value: "NIEDRIG", label: "Niedrig", farbe: "bg-neutral-800 text-neutral-300" },
  { value: "NORMAL", label: "Normal", farbe: "bg-neutral-800 text-white" },
  { value: "HOCH", label: "Hoch", farbe: "bg-orange-500/10 text-orange-400" },
  { value: "DRINGEND", label: "Dringend", farbe: "bg-red-500/10 text-red-400" },
];

export const TICKET_KATEGORIE: { value: TicketKategorie; label: string }[] = [
  { value: "MANGEL_REPARATUR", label: "Mangel / Reparatur" },
  { value: "MIETERANFRAGE", label: "Mieteranfrage" },
  { value: "AUFGABE", label: "Aufgabe" },
  { value: "BUCHHALTUNG", label: "Buchhaltung" },
  { value: "SONSTIGES", label: "Sonstiges" },
];

export const statusLabel = (s: TicketStatus) => TICKET_STATUS.find((x) => x.value === s)?.label ?? s;
export const prioritaetLabel = (p: TicketPrioritaet) => TICKET_PRIORITAET.find((x) => x.value === p)?.label ?? p;
export const kategorieLabel = (k: TicketKategorie) => TICKET_KATEGORIE.find((x) => x.value === k)?.label ?? k;

/** Heutiges Datum als UTC-Mitternacht — wie alle Datumswerte (faelligAm) in der App gespeichert. */
export function heuteUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** Überfällig = noch nicht erledigt und Fälligkeitsdatum liegt vor heute. */
export function istUeberfaellig(t: { status: TicketStatus; faelligAm: Date | null }): boolean {
  return t.status !== "ERLEDIGT" && t.faelligAm !== null && t.faelligAm < heuteUtc();
}
