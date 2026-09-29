import { TicketForm } from "../ticket-form";
import { createTicket } from "../actions";
import { ladeTicketOptionen } from "../lade-optionen";

// Bezüge lassen sich per Query vorbelegen (Links "Ticket anlegen" von Einheit/Mietvertrag/Dienstleister).
export default async function NeuesTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ einheitId?: string; mietvertragId?: string; dienstleisterId?: string; gebaeudeId?: string }>;
}) {
  const q = await searchParams;
  const optionen = await ladeTicketOptionen({ mietvertragId: q.mietvertragId });
  const mietvertrag = optionen.mietvertraege.find((v) => v.id === q.mietvertragId);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Neues Ticket</h1>
      <TicketForm
        optionen={optionen}
        action={createTicket}
        initial={{
          titel: "",
          beschreibung: "",
          status: "OFFEN",
          prioritaet: "NORMAL",
          kategorie: "MANGEL_REPARATUR",
          faelligAm: "",
          einheitId: mietvertrag?.einheitId ?? q.einheitId ?? "",
          mietvertragId: mietvertrag?.id ?? "",
          gebaeudeId: q.gebaeudeId ?? "",
          dienstleisterId: q.dienstleisterId ?? "",
          zugewiesenAnId: "",
        }}
      />
    </div>
  );
}
