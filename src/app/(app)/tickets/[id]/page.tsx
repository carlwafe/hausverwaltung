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
import { TICKET_PRIORITAET, TICKET_STATUS, istUeberfaellig, sichtbareTickets } from "@/lib/ticket";
import { TICKET_SEITE, linkeZelle } from "../ticket-layout";
import { requireUser } from "@/lib/session";

const formatDatumZeit = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(d);

const isoTag = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const ticket = await prisma.ticket.findFirst({
    where: { id, ...sichtbareTickets(user.id) },
    include: {
      kommentare: { orderBy: { createdAt: "asc" } },
      dokumente: true,
      erstelltVon: { select: { name: true, email: true } },
    },
  });
  if (!ticket) notFound();
  const optionen = await ladeTicketOptionen();

  const status = TICKET_STATUS.find((s) => s.value === ticket.status);
  const prioritaet = TICKET_PRIORITAET.find((p) => p.value === ticket.prioritaet);
  const ersteller = ticket.erstelltVon ? (ticket.erstelltVon.name ?? ticket.erstelltVon.email) : null;

  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href="/tickets" className="text-neutral-400 hover:text-white">
          ← Tickets
        </Link>
      </p>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
          <span className="text-base font-semibold text-neutral-500">#{ticket.nummer}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${status?.farbe}`}>{status?.label}</span>
          {ticket.prioritaet !== "NORMAL" && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${prioritaet?.farbe}`}>{prioritaet?.label}</span>
          )}
          {istUeberfaellig(ticket) && <span className="text-xs font-medium text-red-400">überfällig</span>}
          <span>
            · erstellt {formatDatumZeit(ticket.createdAt)}
            {ersteller && ` von ${ersteller}`}
            {ticket.erledigtAm && ` · erledigt ${formatDatumZeit(ticket.erledigtAm)}`}
            {ticket.privat && " · 🔒 privat"}
          </span>
        </p>
        <DeleteButton
          action={deleteTicket.bind(null, id)}
          confirmText="Ticket samt Verlauf und Anhängen wirklich löschen?"
        />
      </div>

      <div className={TICKET_SEITE}>
        <TicketForm
          bearbeiten
          optionen={optionen}
          action={updateTicket.bind(null, id)}
          kannPrivatAendern={ticket.erstelltVonId === null || ticket.erstelltVonId === user.id}
          initial={{
            privat: ticket.privat,
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

        <section className={`min-w-0 rounded-lg border border-neutral-800 p-4 ${linkeZelle(2)}`}>
          <h2 className="mb-3 text-lg font-medium text-white">Verlauf ({ticket.kommentare.length})</h2>
          <ul className="space-y-2">
            {ticket.kommentare.map((k) =>
              k.system ? (
                <li key={k.id} className="flex gap-2 text-xs text-neutral-500">
                  <span aria-hidden>•</span>
                  <span>
                    {formatDatumZeit(k.createdAt)} · {k.text}
                  </span>
                </li>
              ) : (
                <li key={k.id} className="rounded-md bg-neutral-900 px-3 py-2 text-sm">
                  <p className="text-xs text-neutral-500">
                    {k.autor ?? "Kommentar"} · {formatDatumZeit(k.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap text-white">{k.text}</p>
                </li>
              ),
            )}
            {ticket.kommentare.length === 0 && <li className="text-sm text-neutral-500">Noch keine Einträge.</li>}
          </ul>
          <KommentarForm action={addKommentar.bind(null, id)} />
        </section>

        <KostenSektion ticketId={id} className={linkeZelle(3)} />

        <div className={`min-w-0 ${linkeZelle(4)}`}>
          <BelegeSektion
            titel="Anhänge"
            kompakt
            maxBytes={MAX_DOKUMENT_GROESSE_BYTES}
            leerText="Noch keine Anhänge."
            dokumente={ticket.dokumente}
            uploadAction={uploadDokument.bind(null, { ticketId: id, revalidatePath: `/tickets/${id}` })}
            revalidatePath={`/tickets/${id}`}
          />
        </div>
      </div>
    </div>
  );
}
