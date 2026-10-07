import Link from "next/link";
import { DateInput } from "@/components/date-input";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MietvertragForm } from "../../mietvertrag-form";
import { DeleteButton } from "@/components/delete-button";
import { toDateInputValue } from "@/lib/date-utils";
import { ermittleAktuelleMiete } from "@/lib/soll-ist";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import {
  updateMietvertrag,
  deleteMietvertrag,
  erfasseMieterhoehung,
  setzeIndexMonat,
  loescheMieterhoehung,
  erfasseMietnachlass,
  loescheMietnachlass,
} from "../../actions";
import { mieterName, mieterNameNachnameZuerst } from "@/lib/mieter-name";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Eigene Unterseite fürs Bearbeiten (statt eingeklappt auf der Detailseite) — hier stehen
 * ausschließlich das Formular, die Mieterhöhungen-Verwaltung und der Löschen-Knopf. Die normale
 * Detailseite bleibt dadurch ein reiner Lesebereich ohne Löschen-Knopf.
 */
export default async function MietvertragBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vertrag, einheitenRaw, mieter, objekt] = await Promise.all([
    prisma.mietvertrag.findUnique({
      where: { id },
      include: {
        einheit: true,
        mieter: true,
        kaution: true,
        mieterhoehungen: { orderBy: { gueltigAb: "desc" } },
        mietnachlaesse: { orderBy: [{ jahr: "desc" }, { monat: "desc" }] },
      },
    }),
    prisma.einheit.findMany({ include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } }),
    prisma.mieter.findMany({ orderBy: { nachname: "asc" } }),
    prisma.objekt.findFirst({ select: { buchhaltungAb: true } }),
  ]);
  if (!vertrag) notFound();

  const einheiten = sortEinheitenNachGebaeude(einheitenRaw);
  const mieterhoehungen = vertrag.mieterhoehungen.map((m) => ({
    id: m.id,
    gueltigAb: m.gueltigAb,
    kaltmiete: Number(m.kaltmiete),
    nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    notizen: m.notizen,
    indexMonat: m.indexMonat,
  }));
  const aktuelleMiete = ermittleAktuelleMiete({
    kaltmiete: Number(vertrag.kaltmiete),
    nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
    mieterhoehungen,
  });
  const mieterNamen = vertrag.mieter.map((m) => mieterName(m)).join(" & ");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Mietvertrag bearbeiten — {vertrag.einheit.bezeichnung} ({mieterNamen})
          </h1>
          <Link href={`/mietvertraege/${id}`} className="text-sm text-neutral-400 hover:text-white hover:underline">
            ← Zurück ohne zu speichern
          </Link>
        </div>
        <DeleteButton
          action={deleteMietvertrag.bind(null, id)}
          confirmText="Mietvertrag wirklich löschen? Zahlungen und Kaution werden mitgelöscht."
        />
      </div>

      <MietvertragForm
        einheiten={einheiten.map((e) => ({ id: e.id, label: e.bezeichnung, typ: e.typ }))}
        mieter={mieter.map((m) => ({ id: m.id, label: `${mieterNameNachnameZuerst(m)}` }))}
        initial={{
          einheitId: vertrag.einheitId,
          mieterId1: vertrag.mieter[0]?.id ?? "",
          mieterId2: vertrag.mieter[1]?.id,
          beginn: toDateInputValue(vertrag.beginn),
          beginnUnbekannt: vertrag.beginn === null,
          ende: toDateInputValue(vertrag.ende),
          kaltmiete: vertrag.kaltmiete.toString(),
          nebenkostenVorauszahlung: vertrag.nebenkostenVorauszahlung.toString(),
          mehrwertsteuer: vertrag.mehrwertsteuer?.toString() ?? "",
          status: vertrag.status,
          kautionBetrag: vertrag.kaution?.betrag.toString() ?? "",
          kautionAnlageform: vertrag.kaution?.anlageform ?? "KAUTIONSKONTO",
          kautionEinzahlungUnbekannt: vertrag.kaution?.einzahlungUnbekannt ?? false,
          saldovortrag: vertrag.saldovortrag.toString(),
          buchhaltungAb: toDateInputValue(vertrag.buchhaltungAb),
          zahlungsweg: vertrag.zahlungsweg ?? "",
        }}
        objektStichtag={toDateInputValue(objekt?.buchhaltungAb)}
        action={updateMietvertrag.bind(null, id)}
      />

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-white">Mieterhöhungen ({mieterhoehungen.length})</h2>
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Gültig ab</th>
                <th className="px-4 py-2">Kaltmiete</th>
                <th className="px-4 py-2">NK-Vorauszahlung</th>
                <th className="px-4 py-2" title="Bei einer Indexerhöhung: der zugrunde gelegte Preisindex (Monat) — Ausgangswert der nächsten Indexerhöhung">Index-Monat</th>
                <th className="px-4 py-2">Notizen</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {mieterhoehungen.map((m) => (
                <tr key={m.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">{formatDate(m.gueltigAb)}</td>
                  <td className="px-4 py-2 text-white">{formatEuro(m.kaltmiete)}</td>
                  <td className="px-4 py-2 text-white">{formatEuro(m.nebenkostenVorauszahlung)}</td>
                  <td className="px-4 py-2">
                    <form action={setzeIndexMonat.bind(null, m.id)} className="flex items-center gap-1">
                      <input
                        type="month"
                        name="indexMonat"
                        defaultValue={m.indexMonat ?? ""}
                        className="w-36 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white"
                      />
                      <button type="submit" className="text-xs text-neutral-400 hover:text-white">
                        Speichern
                      </button>
                    </form>
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-2 text-white" title={m.notizen ?? ""}>
                    {m.notizen || "–"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeleteButton
                      action={loescheMieterhoehung.bind(null, m.id)}
                      confirmText="Mieterhöhung wirklich löschen?"
                      label="Löschen"
                    />
                  </td>
                </tr>
              ))}
              {mieterhoehungen.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    Noch keine Mieterhöhung erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={erfasseMieterhoehung.bind(null, vertrag.id)}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
        >
          <div>
            <label className="block text-xs text-neutral-400">Gültig ab</label>
            <div className="mt-1">
              <DateInput name="gueltigAb" required />
            </div>
          </div>
          <div>
            <label className="block text-xs text-neutral-400">Kaltmiete</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="kaltmiete"
              required
              defaultValue={aktuelleMiete.kaltmiete}
              className="mt-1 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400">NK-Vorauszahlung</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="nebenkostenVorauszahlung"
              required
              defaultValue={aktuelleMiete.nebenkostenVorauszahlung}
              className="mt-1 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400" title="Nur bei Indexerhöhung: der im Schreiben zugrunde gelegte Preisindex">
              Index-Monat (optional)
            </label>
            <input
              type="month"
              name="indexMonat"
              className="mt-1 w-40 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-neutral-400">Notizen (optional)</label>
            <input
              type="text"
              name="notizen"
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            + Mieterhöhung erfassen
          </button>
        </form>
      </div>

      <div className="mt-8">
        <h2 className="mb-1 text-lg font-medium text-white">Mietnachlässe ({vertrag.mietnachlaesse.length})</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Einmaliger Nachlass auf die Kaltmiete eines einzelnen Monats, z.B. weil der Mieter erst nach dem
          1. eingezogen ist oder der Verwalter einen Monat anteilig berechnet hat. Er mindert nur das Soll dieses
          Monats (Mieterkonto, Offene Posten, Jahres-/Quartalsübersicht); die vertragliche Miete, Mieterhöhungen
          und die NK-Vorauszahlung bleiben unverändert.
        </p>
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Monat</th>
                <th className="px-4 py-2">Nachlass Kaltmiete</th>
                <th className="px-4 py-2">Grund</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {vertrag.mietnachlaesse.map((n) => (
                <tr key={n.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">
                    {MONATSNAMEN[n.monat - 1]} {n.jahr}
                  </td>
                  <td className="px-4 py-2 text-white">{formatEuro(-Number(n.betrag))}</td>
                  <td className="px-4 py-2 text-white">{n.grund}</td>
                  <td className="px-4 py-2 text-right">
                    <DeleteButton
                      action={loescheMietnachlass.bind(null, n.id)}
                      confirmText="Mietnachlass wirklich löschen? Das Soll des Monats steigt wieder auf die volle Miete."
                      label="Löschen"
                    />
                  </td>
                </tr>
              ))}
              {vertrag.mietnachlaesse.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    Noch kein Mietnachlass erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={erfasseMietnachlass.bind(null, vertrag.id)}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
        >
          <div>
            <label className="block text-xs text-neutral-400">Monat</label>
            <input
              type="month"
              name="monat"
              required
              defaultValue={vertrag.beginn ? toDateInputValue(vertrag.beginn).slice(0, 7) : undefined}
              className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400">Nachlass (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="betrag"
              required
              className="mt-1 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-neutral-400">Grund</label>
            <input
              type="text"
              name="grund"
              required
              placeholder="z.B. Einzug erst am 11.04., Verwalter hat anteilig berechnet"
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            + Mietnachlass erfassen
          </button>
        </form>
      </div>
    </div>
  );
}
