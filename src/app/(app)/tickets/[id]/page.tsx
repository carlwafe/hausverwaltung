import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TicketForm } from "../ticket-form";
import { KommentarForm } from "../kommentar-form";
import { addKommentar, deleteTicket, updateTicket } from "../actions";
import { ladeTicketOptionen } from "../lade-optionen";
import { KostenSektion } from "../kosten-sektion";
import { BelegeSektion } from "@/components/belege-sektion";
import { DeleteButton } from "@/components/delete-button";
import { uploadDokument } from "../../dokumente/actions";
import { MAX_DOKUMENT_GROESSE_BYTES } from "@/lib/upload-limits";
import { TICKET_STATUS } from "@/lib/ticket";

const formatDatumZeit = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(d);

const isoTag = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      kommentare: { orderBy: { createdAt: "asc" } },
      dokumente: true,
      erstelltVon: { select: { name: true, email: true } },
    },
  });
  if (!ticket) notFound();
  const optionen = await ladeTicketOptionen({ mietvertragId: ticket.mietvertragId });

  const status = TICKET_STATUS.find((s) => s.value === ticket.status);
  const ersteller = ticket.erstelltVon ? (ticket.erstelltVon.name ?? ticket.erstelltVon.email) : null;

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href="/tickets" className="text-neutral-400 hover:text-white">
          ← Tickets
        </Link>
      </p>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold text-white">
            <span className="text-neutral-500">#{ticket.nummer}</span> {ticket.titel}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            <span className={`rounded-full px-2 py-0.5 text-xs ${status?.farbe}`}>{status?.label}</span>
            {" · "}erstellt {formatDatumZeit(ticket.createdAt)}
            {ersteller && ` von ${ersteller}`}
            {ticket.erledigtAm && ` · erledigt ${formatDatumZeit(ticket.erledigtAm)}`}
          </p>
        </div>
        <DeleteButton
          action={deleteTicket.bind(null, id)}
          confirmText="Ticket samt Verlauf und Anhängen wirklich löschen?"
        />
      </div>

      <TicketForm
        bearbeiten
        optionen={optionen}
        action={updateTicket.bind(null, id)}
        initial={{
          titel: ticket.titel,
          beschreibung: ticket.beschreibung ?? "",
          status: ticket.status,
          prioritaet: ticket.prioritaet,
          kategorie: ticket.kategorie,
          faelligAm: isoTag(ticket.faelligAm),
          einheitId: ticket.einheitId ?? "",
          mietvertragId: ticket.mietvertragId ?? "",
          gebaeudeId: ticket.gebaeudeId ?? "",
          hausId: ticket.hausId ?? "",
          dienstleisterId: ticket.dienstleisterId ?? "",
          zugewiesenAnId: ticket.zugewiesenAnId ?? "",
        }}
      />

      <div className="mt-8 max-w-3xl rounded-lg border border-neutral-800 p-4">
        <h2 className="mb-3 text-lg font-medium text-white">Verlauf ({ticket.kommentare.length})</h2>
        <ul className="space-y-3">
          {ticket.kommentare.map((k) => (
            <li key={k.id} className="text-sm">
              <p className="text-xs text-neutral-500">
                {formatDatumZeit(k.createdAt)}
                {k.autor && ` · ${k.autor}`}
              </p>
              <p className={k.system ? "italic text-neutral-400" : "whitespace-pre-wrap text-white"}>{k.text}</p>
            </li>
          ))}
          {ticket.kommentare.length === 0 && <li className="text-sm text-neutral-500">Noch keine Einträge.</li>}
        </ul>
        <KommentarForm action={addKommentar.bind(null, id)} />
      </div>

      <KostenSektion ticketId={id} />

      <div className="mt-8 max-w-3xl">
        <BelegeSektion
          titel="Anhänge"
          maxBytes={MAX_DOKUMENT_GROESSE_BYTES}
          leerText="Noch keine Anhänge."
          dokumente={ticket.dokumente}
          uploadAction={uploadDokument.bind(null, { ticketId: id, revalidatePath: `/tickets/${id}` })}
          revalidatePath={`/tickets/${id}`}
        />
      </div>
    </div>
  );
}
