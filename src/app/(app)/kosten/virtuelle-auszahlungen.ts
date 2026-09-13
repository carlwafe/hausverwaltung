import { prisma } from "@/lib/prisma";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type VirtuelleAuszahlungOption = { id: string; label: string; datumISO: string };

// Kandidaten für die Verknüpfung einer Kostenposition mit ihrer Kaution-Gegenbuchung — von
// kosten/neu/page.tsx und kosten/[id]/page.tsx genutzt. `datumISO` (yyyy-mm-dd) dient dort als
// Grundlage für eine Vorauswahl auf Buchungen vom selben Tag, bevor aktiv gesucht wird.
export async function ladeVirtuelleAuszahlungen(): Promise<VirtuelleAuszahlungOption[]> {
  const buchungen = await prisma.kautionBuchung.findMany({
    where: { kategorie: "VIRTUELLE_AUSZAHLUNG" },
    orderBy: { datum: "desc" },
    include: {
      mietvertrag: { include: { einheit: true, mieter: true } },
      _count: { select: { virtuelleGutschriften: true } },
    },
  });
  return buchungen.map((b) => {
    const mieterNamen = b.mietvertrag?.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ");
    const wer = mieterNamen ? `${b.mietvertrag?.einheit.bezeichnung} — ${mieterNamen}` : "kein Mietvertrag";
    const hinweis = b._count.virtuelleGutschriften > 0 ? " (bereits verknüpft)" : "";
    return {
      id: b.id,
      label: `${new Intl.DateTimeFormat("de-DE").format(b.datum)} — ${wer} — ${formatEuro(Number(b.betrag))}${hinweis}`,
      datumISO: b.datum.toISOString().slice(0, 10),
    };
  });
}
