import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TicketTable } from "./ticket-table";
import { TICKET_KATEGORIE } from "@/lib/ticket";
import { TICKET_ZEILE_INCLUDE, ticketZeile } from "./ticket-zeilen";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const { alle } = await searchParams;
  const zeigeErledigte = alle === "1";

  const tickets = await prisma.ticket.findMany({
    where: zeigeErledigte ? {} : { status: { not: "ERLEDIGT" } },
    include: TICKET_ZEILE_INCLUDE,
    // Wichtigstes zuerst: dringend vor niedrig (Enum-Reihenfolge), dann nach Fälligkeit, neueste Nr. zuerst.
    orderBy: [{ prioritaet: "desc" }, { faelligAm: { sort: "asc", nulls: "last" } }, { nummer: "desc" }],
  });
  const rows = tickets.map(ticketZeile);
  // Oben Mängel/Reparaturen und alles Übrige, unten die Buchhaltung.
  const buchhaltung = rows.filter((r) => r.kategorie === "BUCHHALTUNG");
  const sonstige = rows.filter((r) => r.kategorie !== "BUCHHALTUNG");
  const kategorienSonstige = TICKET_KATEGORIE.map((k) => k.value).filter((v) => v !== "BUCHHALTUNG");
  const ueberfaellig = rows.filter((r) => r.ueberfaellig).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Tickets</h1>
          <p className="text-sm text-neutral-400">
            {rows.length} {zeigeErledigte ? "Tickets" : "offene Tickets"}
            {ueberfaellig > 0 && <span className="text-red-400"> · {ueberfaellig} überfällig</span>}
            {" · "}
            <Link href={zeigeErledigte ? "/tickets" : "/tickets?alle=1"} className="underline hover:text-white">
              {zeigeErledigte ? "nur offene anzeigen" : "auch erledigte anzeigen"}
            </Link>
          </p>
        </div>
        <Link
          href="/tickets/neu"
          className="shrink-0 whitespace-nowrap rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neues Ticket
        </Link>
      </div>
      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium text-white">
          Mängel, Reparaturen &amp; Sonstiges <span className="text-sm font-normal text-neutral-400">({sonstige.length})</span>
        </h2>
        <TicketTable rows={sonstige} kategorien={kategorienSonstige} emptyMessage="Keine Tickets." />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-medium text-white">
          Buchhaltung <span className="text-sm font-normal text-neutral-400">({buchhaltung.length})</span>
        </h2>
        <TicketTable rows={buchhaltung} kategorien={["BUCHHALTUNG"]} emptyMessage="Keine Buchhaltungs-Tickets." />
      </section>
    </div>
  );
}
