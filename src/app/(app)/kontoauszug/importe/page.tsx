import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ImporteTabelle, type GruppierterImportRow } from "./importe-tabelle";

export default async function KontoauszugImportePage() {
  const batches = await prisma.importBatch.findMany({
    where: { typ: "KONTOAUSZUG" },
    orderBy: { erstelltAm: "desc" },
    include: {
      _count: {
        select: {
          zahlungen: true,
          kostenpositionen: true,
          eigentuemerbuchungen: true,
          kautionsbuchungen: true,
          sonstigeBuchungen: true,
        },
      },
    },
  });

  const rows = batches.map((b) => ({
    id: b.id,
    dateiname: b.dateiname,
    erstelltAm: b.erstelltAm.toISOString(),
    anzahlZeilen: b.anzahlZeilen,
    anzahlZahlungen: b._count.zahlungen,
    anzahlKosten: b._count.kostenpositionen,
    anzahlMietweiterleitungen: b._count.eigentuemerbuchungen,
    anzahlKautionsbuchungen: b._count.kautionsbuchungen,
    anzahlSonstige: b._count.sonstigeBuchungen,
  }));
  const verwaisteAnzahl = rows.filter(
    (r) =>
      r.anzahlZahlungen === 0 &&
      r.anzahlKosten === 0 &&
      r.anzahlMietweiterleitungen === 0 &&
      r.anzahlKautionsbuchungen === 0 &&
      r.anzahlSonstige === 0,
  ).length;
  const genutzteRows = rows.filter(
    (r) =>
      r.anzahlZahlungen > 0 ||
      r.anzahlKosten > 0 ||
      r.anzahlMietweiterleitungen > 0 ||
      r.anzahlKautionsbuchungen > 0 ||
      r.anzahlSonstige > 0,
  );

  // Dieselbe Datei kann mehrfach hochgeladen worden sein (z.B. Zahlungen und Kosten in zwei
  // getrennten Sitzungen übernommen) — dann pro Datei eine einzige Zeile mit aufsummierten
  // Zahlen statt mehrerer Einzelzeilen für denselben Kontoauszug.
  const gruppenNachDatei = new Map<string, typeof genutzteRows>();
  for (const r of genutzteRows) {
    const liste = gruppenNachDatei.get(r.dateiname) ?? [];
    liste.push(r);
    gruppenNachDatei.set(r.dateiname, liste);
  }
  const gruppierteRows: GruppierterImportRow[] = [...gruppenNachDatei.entries()]
    .map(([dateiname, liste]) => {
      const neuesteZuerst = [...liste].sort((a, b) => b.erstelltAm.localeCompare(a.erstelltAm));
      return {
        dateiname,
        erstelltAm: neuesteZuerst[0].erstelltAm,
        anzahlZeilen: neuesteZuerst[0].anzahlZeilen,
        anzahlZahlungen: liste.reduce((s, r) => s + r.anzahlZahlungen, 0),
        anzahlKosten: liste.reduce((s, r) => s + r.anzahlKosten, 0),
        anzahlMietweiterleitungen: liste.reduce((s, r) => s + r.anzahlMietweiterleitungen, 0),
        anzahlKautionsbuchungen: liste.reduce((s, r) => s + r.anzahlKautionsbuchungen, 0),
        anzahlSonstige: liste.reduce((s, r) => s + r.anzahlSonstige, 0),
        anzahlImporte: liste.length,
        pruefBatchId: neuesteZuerst[0].id,
      };
    })
    .sort((a, b) => b.erstelltAm.localeCompare(a.erstelltAm));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Kontoauszug-Importe</h1>
          <p className="text-sm text-neutral-400">
            {gruppierteRows.length} Datei{gruppierteRows.length === 1 ? "" : "en"} mit übernommenen
            Buchungen{verwaisteAnzahl > 0 && `, ${verwaisteAnzahl} ohne Ergebnis (nur Vorschau)`}
          </p>
        </div>
        <Link
          href="/kontoauszug/import"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          Neu importieren
        </Link>
      </div>

      <ImporteTabelle rows={gruppierteRows} verwaisteAnzahl={verwaisteAnzahl} />
    </div>
  );
}
