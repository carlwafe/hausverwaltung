import { prisma } from "@/lib/prisma";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";
import { BuchungsartAendernForm } from "./buchungsart-aendern-form";

/**
 * Knopf "Buchungsart ändern" für eine bestehende Buchung (Zahlung, Kostenposition, …). Lädt die
 * wählbaren Ziel-Buchungsarten (aktiv + zahlungswirksam, nicht die aktuelle) und die Auswahllisten
 * selbst, damit jede Detailseite nur eine Zeile braucht.
 */
export async function BuchungsartAendern({
  buchungId,
  aktuellerCode,
  aktuelleMietvertragId,
  rueckPfad,
  datum,
}: {
  buchungId: string;
  aktuellerCode: string;
  aktuelleMietvertragId: string | null;
  rueckPfad: string;
  datum: Date;
}) {
  const [arten, vertraegeRaw, kostenarten] = await Promise.all([
    prisma.buchungsart.findMany({
      where: { aktiv: true, zahlungswirksam: true, code: { not: aktuellerCode } },
      orderBy: { bezeichnung: "asc" },
      select: { code: true, bezeichnung: true },
    }),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      include: { einheit: true, mieter: true },
    }),
    prisma.kostenart.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const vertraege = [...vertraegeRaw].sort((a, b) => vergleicheEinheitBezeichnung(a.einheit.bezeichnung, b.einheit.bezeichnung));

  return (
    <BuchungsartAendernForm
      buchungId={buchungId}
      arten={arten}
      mietvertraege={vertraege.map((v) => ({
        id: v.id,
        label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
      }))}
      kostenarten={kostenarten}
      aktuelleMietvertragId={aktuelleMietvertragId ?? ""}
      rueckPfad={rueckPfad}
      vorschlagMonat={datum.getMonth() + 1}
      vorschlagJahr={datum.getFullYear()}
    />
  );
}
