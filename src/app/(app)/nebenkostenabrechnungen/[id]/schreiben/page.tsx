import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { SchreibenAuswahl, type SchreibenZeile } from "./schreiben-auswahl";
import { ladeArbeitskostenStand } from "@/lib/arbeitskosten";

// Schreiben „Betriebskostenabrechnung“ an die Mieter (PDF im Layout „klar“, siehe CLAUDE.md): je Mietvertrag eines oder
// alle auf einmal. Die Seite listet nur die Positionen; das PDF entsteht erst beim Klick (Route
// /api/nebenkostenabrechnung/schreiben, nur lesend).
const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export default async function NkSchreibenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abrechnung = await prisma.nebenkostenabrechnung.findUnique({
    where: { id },
    select: {
      id: true,
      jahr: true,
      versendetAm: true,
      positionen: {
        where: { mietvertragId: { not: null } },
        select: {
          mietvertragId: true,
          kostenanteilGesamt: true,
          vorauszahlungGesamt: true,
          saldo: true,
          details: true,
          einheit: { select: { bezeichnung: true } },
          mietvertrag: { select: { status: true, mieter: { select: { vorname: true, nachname: true } } } },
        },
      },
    },
  });
  if (!abrechnung) notFound();

  const zeilen: SchreibenZeile[] = abrechnung.positionen
    .map((p) => {
      const berechnet = Array.isArray(p.details) && p.details.length > 0;
      return {
        mietvertragId: p.mietvertragId!,
        wohnung: p.einheit.bezeichnung.split(" - ")[0].trim(),
        mieter: (p.mietvertrag?.mieter ?? []).map((m) => mieterName(m)).join(" & ") || "–",
        beendet: p.mietvertrag?.status === "BEENDET",
        kostenanteil: Number(p.kostenanteilGesamt),
        vorauszahlung: Number(p.vorauszahlungGesamt),
        saldo: Number(p.saldo),
        moeglich: berechnet && (p.mietvertrag?.mieter.length ?? 0) > 0,
      };
    })
    .sort((a, b) => a.wohnung.localeCompare(b.wohnung, "de", { numeric: true }) || a.mieter.localeCompare(b.mieter, "de"));

  const arbeitskosten = await ladeArbeitskostenStand(abrechnung.jahr);
  const heute = new Date();
  const frist = new Date(heute.getTime() + 14 * 86400000);

  return (
    <div>
      <Link href={`/nebenkostenabrechnungen/${id}`} className="mb-2 inline-block text-sm text-neutral-400 hover:text-white">
        ← Nebenkostenabrechnung {abrechnung.jahr}
      </Link>
      <h1 className="text-2xl font-semibold text-white">Schreiben Betriebskostenabrechnung {abrechnung.jahr}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-neutral-400">
        Je Mietvertrag ein Schreiben als PDF (Ergebnis, Kostenaufstellung mit Verteilerschlüsseln, Vorauszahlungen,
        Zahlungs- bzw. Auszahlungshinweis). Es zeigt die gespeicherten Positionen — nach geänderten Kosten oder Zahlungen
        zuerst auf der Abrechnungsseite „Neu berechnen“. Bereits gebuchte Auszahlungen oder Verrechnungen berücksichtigt
        es nicht. Briefdatum und Frist sind frei wählbar; Absender, Konto und Kontakt stammen aus „Objekt“.
      </p>
      <div className="mb-6 max-w-3xl rounded-md border border-neutral-800 px-3 py-2 text-sm">
        <p className="font-medium text-white">Arbeitskosten für die Anlage (§ 35a EStG)</p>
        {arbeitskosten.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-500">
            Für {abrechnung.jahr} ist noch kein Arbeitskostenanteil erfasst — die Schreiben haben dann keine Anlage. Der Anteil
            (Lohn inkl. Umsatzsteuer, ohne Material) wird an der einzelnen Kostenposition eingetragen (Kosten → Position → „Arbeitskosten“).
          </p>
        ) : (
          <>
            <table className="mt-2 w-full text-xs">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="py-1 pr-3">Kostenart</th>
                  <th className="py-1 pr-3 text-right">Positionen mit Angabe</th>
                  <th className="py-1 pr-3 text-right">Rechnungsbetrag</th>
                  <th className="py-1 pr-3 text-right">Arbeitskosten</th>
                  <th className="py-1 pr-3 text-right">Anteil</th>
                  <th className="py-1">Anlage</th>
                </tr>
              </thead>
              <tbody>
                {arbeitskosten.map((k) => (
                  <tr key={k.kostenartId} className="border-t border-neutral-800">
                    <td className="py-1 pr-3 text-neutral-200">{k.kostenartName}</td>
                    <td className="py-1 pr-3 text-right text-neutral-300">
                      {k.mitAngabe} von {k.positionen}
                    </td>
                    <td className="py-1 pr-3 text-right text-neutral-300">{euro(k.summeBetrag)}</td>
                    <td className="py-1 pr-3 text-right text-neutral-300">{euro(k.summeArbeit)}</td>
                    <td className="py-1 pr-3 text-right text-neutral-300">
                      {k.quote === null ? "–" : `${(k.quote * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`}
                    </td>
                    <td className={`py-1 ${k.vollstaendig ? "text-green-400" : "text-amber-400"}`}>
                      {k.vollstaendig ? "erscheint" : `unvollständig – fehlt bei ${k.positionen - k.mitAngabe}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-neutral-500">
              Eine Kostenart steht in der Anlage nur, wenn <em>alle</em> ihre Positionen des Jahres eine Angabe haben (0 € ist erlaubt).
              Der Anteil des Mieters = sein Kostenanteil × Arbeitskosten ÷ Rechnungsbetrag.
            </p>
          </>
        )}
      </div>
      <SchreibenAuswahl
        abrechnungId={id}
        heute={heute.toISOString().slice(0, 10)}
        frist={frist.toISOString().slice(0, 10)}
        zeilen={zeilen}
      />
    </div>
  );
}
