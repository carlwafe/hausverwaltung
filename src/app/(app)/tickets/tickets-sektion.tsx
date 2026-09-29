import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { TICKET_PRIORITAET, TICKET_STATUS, istUeberfaellig } from "@/lib/ticket";

// Kleine Liste offener Tickets zu einer Einheit/einem Mietvertrag/Dienstleister mit Einstieg
// "Ticket anlegen" (Bezug vorbelegt) — eingebettet in die jeweiligen Detailseiten.
export async function TicketsSektion({
  where,
  neuQuery,
}: {
  where: Prisma.TicketWhereInput;
  neuQuery: Record<string, string>;
}) {
  const tickets = await prisma.ticket.findMany({
    where: { ...where, status: { not: "ERLEDIGT" } },
    orderBy: [{ prioritaet: "desc" }, { nummer: "desc" }],
  });
  const neuHref = `/tickets/neu?${new URLSearchParams(neuQuery).toString()}`;

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">Offene Tickets ({tickets.length})</h2>
        <Link href={neuHref} className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-900">
          + Ticket anlegen
        </Link>
      </div>
      {tickets.length === 0 ? (
        <p className="text-sm text-neutral-500">Keine offenen Tickets.</p>
      ) : (
        <ul className="divide-y divide-neutral-800 text-sm">
          {tickets.map((t) => {
            const status = TICKET_STATUS.find((s) => s.value === t.status);
            const prio = TICKET_PRIORITAET.find((p) => p.value === t.prioritaet);
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/tickets/${t.id}`} className="min-w-0 truncate text-white hover:underline">
                  <span className="text-neutral-500">#{t.nummer}</span> {t.titel}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  {istUeberfaellig(t) && <span className="text-xs text-red-400">überfällig</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${prio?.farbe}`}>{prio?.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${status?.farbe}`}>{status?.label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
