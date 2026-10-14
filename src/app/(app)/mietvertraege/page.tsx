import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MietvertraegeTable, type VertragRow } from "./mietvertraege-table";
import { ermittleAktuelleMiete } from "@/lib/soll-ist";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { gebaeudeGruppeAnzeige } from "@/lib/gebaeude-gruppen";
import { mieterName } from "@/lib/mieter-name";
import { ZAHLUNGSWEG_LABEL, type ZahlungswegArt } from "@/lib/zahlungsweg-anzeige";
import { ZahlungswegHinweisAktionen } from "./zahlungsweg-hinweis-aktionen";

async function ladeVertraege(): Promise<VertragRow[]> {
  const vertraegeRaw = await prisma.mietvertrag.findMany({
    include: {
      einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
      mieter: true,
      mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
    },
  });

  // sortEinheitenNachGebaeude braucht nur `bezeichnung`+`gebaeude` auf oberster Ebene — hier aus
  // der Einheit des jeweiligen Mietvertrags gespiegelt, damit die Standard-Sortierung derselben
  // "wie auf dem Grundstück"-Reihenfolge folgt wie auf /einheiten (erst Haus-Gruppe, dann
  // Hausnummer, dann Bezeichnung).
  const vertraege = sortEinheitenNachGebaeude(
    vertraegeRaw.map((v) => ({ ...v, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude })),
  );

  return vertraege.map((v) => {
    const aktuelleMiete = ermittleAktuelleMiete({
      kaltmiete: Number(v.kaltmiete),
      nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
      mieterhoehungen: v.mieterhoehungen.map((m) => ({
        gueltigAb: m.gueltigAb,
        kaltmiete: Number(m.kaltmiete),
        nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
      })),
    });
    const gebaeudeGruppe = gebaeudeGruppeAnzeige(v.einheit.gebaeude);
    return {
      id: v.id,
      gebaeudeLabel: gebaeudeGruppe.label,
      gebaeudeHref: gebaeudeGruppe.href,
      einheitBezeichnung: v.einheit.bezeichnung,
      mieterNamen: v.mieter.map((m) => mieterName(m)).join(" & "),
      beginn: v.beginn ? v.beginn.toISOString() : null,
      ende: v.ende ? v.ende.toISOString() : null,
      kaltmiete: aktuelleMiete.kaltmiete,
      nebenkostenVorauszahlung: aktuelleMiete.nebenkostenVorauszahlung,
      status: v.status,
      zahlungsweg: v.zahlungsweg,
      zahlungswegHinweis: v.status === "BEENDET" ? null : v.zahlungswegHinweis,
    };
  });
}

export default async function MietvertraegePage() {
  const vertraege = await ladeVertraege();
  const mitHinweis = vertraege.filter((v) => v.zahlungswegHinweis);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mietverträge</h1>
          <p className="text-sm text-neutral-400">{vertraege.length} Verträge insgesamt</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/mietvertraege/import"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Aus Datei importieren
          </Link>
          <Link
            href="/mietvertraege/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neuer Mietvertrag
          </Link>
        </div>
      </div>

      {mitHinweis.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-300">
            {mitHinweis.length === 1 ? "1 Vertrag: Zahlungsweg prüfen" : `${mitHinweis.length} Verträge: Zahlungsweg prüfen`}
          </p>
          <p className="mb-3 mt-1 text-xs text-neutral-400">
            Die jüngsten Zahlungen im Kontoauszug passen nicht mehr zum erfassten Zahlungsweg (z.B. zahlt der Mieter wieder selbst statt über das Amt).
            Mit „Übernehmen“ wird der Vorschlag eingetragen, „Hinweis verwerfen“ blendet genau diesen Vorschlag aus.
          </p>
          <ul className="space-y-2 text-sm">
            {mitHinweis.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={`/mietvertraege/${v.id}`} className="text-white hover:underline">
                  {v.einheitBezeichnung} · {v.mieterNamen}
                </Link>
                <span className="text-neutral-400">
                  erfasst: {v.zahlungsweg ? ZAHLUNGSWEG_LABEL[v.zahlungsweg as ZahlungswegArt] : "–"} → Vorschlag:{" "}
                  <span className="text-amber-300">{ZAHLUNGSWEG_LABEL[v.zahlungswegHinweis as ZahlungswegArt]}</span>
                </span>
                <ZahlungswegHinweisAktionen id={v.id} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <MietvertraegeTable rows={vertraege} />
    </div>
  );
}
