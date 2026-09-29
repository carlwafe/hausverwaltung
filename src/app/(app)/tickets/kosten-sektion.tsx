import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { DeleteButton } from "@/components/delete-button";
import { loeseKosten } from "./actions";
import { KostenVerknuepfen } from "./kosten-verknuepfen";

const formatEuro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
const formatDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(d);

const kurz = (s: string | null, n = 40) => (s && s.length > n ? `${s.slice(0, n)}…` : (s ?? ""));

// Kostenpositionen eines Tickets (z.B. Handwerkerrechnung) plus Auswahl zum Verknüpfen weiterer.
export async function KostenSektion({ ticketId }: { ticketId: string }) {
  const [verknuepft, kandidaten] = await Promise.all([
    prisma.ticketKosten.findMany({
      where: { ticketId, buchung: AKTIVE_BUCHUNG_FILTER },
      include: { buchung: { include: { kostenart: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.buchung.findMany({
      where: {
        buchungsart: { code: "KOSTENPOSITION" },
        ...AKTIVE_BUCHUNG_FILTER,
        ticketKosten: { none: { ticketId } },
      },
      orderBy: [{ jahr: "desc" }, { datum: { sort: "desc", nulls: "last" } }, { erstelltAm: "desc" }],
      include: { kostenart: true },
      take: 500,
    }),
  ]);

  const summe = verknuepft.reduce((s, v) => s + Number(v.buchung.betrag), 0);

  return (
    <div className="mt-8 max-w-3xl rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Kosten ({verknuepft.length})</h2>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="py-2 pr-3">Datum</th>
              <th className="px-3 py-2">Kostenart</th>
              <th className="px-3 py-2">Empfänger / Zweck</th>
              <th className="px-3 py-2 text-right">Betrag</th>
              <th className="py-2 pl-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {verknuepft.map(({ buchung: b }) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap py-2 pr-3 text-neutral-300">{b.datum ? formatDate(b.datum) : b.jahr}</td>
                <td className="px-3 py-2 text-neutral-300">{b.kostenart?.name ?? "–"}</td>
                <td className="px-3 py-2 text-white" title={[b.empfaenger, b.verwendungszweck].filter(Boolean).join(" · ")}>
                  {kurz([b.empfaenger, b.verwendungszweck].filter(Boolean).join(" · "), 60) || "–"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-white">{formatEuro(Number(b.betrag))}</td>
                <td className="py-2 pl-3 text-right">
                  <DeleteButton
                    size="sm"
                    label="Lösen"
                    confirmText="Verknüpfung lösen? Die Kostenposition selbst bleibt unverändert."
                    action={loeseKosten.bind(null, ticketId, b.id)}
                  />
                </td>
              </tr>
            ))}
            {verknuepft.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-sm text-neutral-500">
                  Noch keine Kosten verknüpft.
                </td>
              </tr>
            )}
          </tbody>
          {verknuepft.length > 0 && (
            <tfoot className="border-t border-neutral-800">
              <tr>
                <td colSpan={3} className="py-2 pr-3 text-right text-xs uppercase text-neutral-400">
                  Summe
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-white">{formatEuro(summe)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <KostenVerknuepfen
        ticketId={ticketId}
        kandidaten={kandidaten.map((b) => ({
          id: b.id,
          label: [
            b.datum ? formatDate(b.datum) : String(b.jahr),
            kurz(b.empfaenger ?? b.verwendungszweck, 35),
            b.kostenart?.name,
            formatEuro(Number(b.betrag)),
          ]
            .filter(Boolean)
            .join(" · "),
        }))}
      />
      <p className="mt-2 text-xs text-neutral-500">
        Zur Auswahl stehen die 500 neuesten Kostenpositionen. Wird eine Kostenposition bearbeitet (Storno + Neuanlage),
        muss sie hier neu verknüpft werden.
      </p>
    </div>
  );
}
