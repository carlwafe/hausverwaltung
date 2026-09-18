import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type VirtuelleAuszahlungOption = { id: string; label: string; datumISO: string };

// Kandidaten für die Verknüpfung einer Kostenposition mit ihrer Kaution-Gegenbuchung — von
// kosten/neu/page.tsx und kosten/[id]/page.tsx genutzt. `datumISO` (yyyy-mm-dd) dient dort als
// Grundlage für eine Vorauswahl auf Buchungen vom selben Tag, bevor aktiv gesucht wird.
export async function ladeVirtuelleAuszahlungen(): Promise<VirtuelleAuszahlungOption[]> {
  const buchungen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "KAUTION_VIRTUELLE_AUSZAHLUNG" }, datum: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
    orderBy: { datum: "desc" },
    include: { mietvertrag: { include: { einheit: true, mieter: true } } },
  });
  // Frühere eigene Relation virtuelleGutschriften ersetzt durch den polymorphen
  // bezugTyp/bezugId-Bezug (siehe kosten-liste.ts) — hier per Hand nachgeschlagen statt per
  // include/_count, da kein echter FK mehr besteht.
  const gutschriften = await prisma.buchung.findMany({
    where: { bezugTyp: "Buchung", bezugId: { in: buchungen.map((b) => b.id) } },
    select: { bezugId: true },
  });
  const gutschriftenAnzahl = new Map<string, number>();
  for (const g of gutschriften) {
    gutschriftenAnzahl.set(g.bezugId!, (gutschriftenAnzahl.get(g.bezugId!) ?? 0) + 1);
  }

  return buchungen.map((b) => {
    const mieterNamen = b.mietvertrag?.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ");
    const wer = mieterNamen ? `${b.mietvertrag?.einheit.bezeichnung} — ${mieterNamen}` : "kein Mietvertrag";
    const hinweis = (gutschriftenAnzahl.get(b.id) ?? 0) > 0 ? " (bereits verknüpft)" : "";
    return {
      id: b.id,
      label: `${new Intl.DateTimeFormat("de-DE").format(b.datum!)} — ${wer} — ${formatEuro(Number(b.betrag))}${hinweis}`,
      datumISO: b.datum!.toISOString().slice(0, 10),
    };
  });
}
