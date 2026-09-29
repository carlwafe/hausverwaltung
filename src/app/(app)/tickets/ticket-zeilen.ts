import { istUeberfaellig } from "@/lib/ticket";
import { mieterName } from "@/lib/mieter-name";
import { hausLabel } from "@/lib/gebaeude-gruppen";
import type { TicketRow } from "./ticket-table";

// Prisma-Include, das alles liefert, was ticketZeile für Bezug/Zuständigkeit braucht.
export const TICKET_ZEILE_INCLUDE = {
  einheit: { include: { gebaeude: true } },
  gebaeude: true,
  haus: { include: { gebaeude: true } },
  mietvertrag: { include: { mieter: true } },
  dienstleister: true,
  zugewiesenAn: { select: { name: true, email: true } },
} as const;

type TicketMitBezug = {
  id: string;
  nummer: number;
  titel: string;
  kategorie: string;
  status: "OFFEN" | "IN_BEARBEITUNG" | "WARTET" | "ERLEDIGT";
  prioritaet: string;
  faelligAm: Date | null;
  einheit: { bezeichnung: string; gebaeude: { strasse: string; hausnummer: string } } | null;
  gebaeude: { strasse: string; hausnummer: string } | null;
  haus: { gebaeude: { strasse: string; hausnummer: string }[] } | null;
  mietvertrag: { mieter: { vorname: string; nachname: string }[] } | null;
  dienstleister: { name: string } | null;
  zugewiesenAn: { name: string | null; email: string } | null;
};

export function ticketZeile(t: TicketMitBezug): TicketRow {
  const teile: string[] = [];
  if (t.einheit) teile.push(`${t.einheit.gebaeude.strasse} ${t.einheit.gebaeude.hausnummer} – ${t.einheit.bezeichnung}`);
  else if (t.gebaeude) teile.push(`${t.gebaeude.strasse} ${t.gebaeude.hausnummer}`);
  else if (t.haus) teile.push(hausLabel(t.haus.gebaeude));
  if (t.mietvertrag && t.mietvertrag.mieter.length > 0) teile.push(t.mietvertrag.mieter.map(mieterName).join(" & "));
  if (t.dienstleister) teile.push(t.dienstleister.name);

  return {
    id: t.id,
    nummer: t.nummer,
    titel: t.titel,
    kategorie: t.kategorie,
    status: t.status,
    prioritaet: t.prioritaet,
    faelligAm: t.faelligAm ? t.faelligAm.toISOString().slice(0, 10) : null,
    ueberfaellig: istUeberfaellig(t),
    bezug: teile.join(" · "),
    zustaendig: t.zugewiesenAn ? (t.zugewiesenAn.name ?? t.zugewiesenAn.email) : "",
  };
}
