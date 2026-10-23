import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { SchreibenAuswahl, type SchreibenZeile } from "./schreiben-auswahl";

// Schreiben „Betriebskostenabrechnung“ an die Mieter (PDF im Layout „klar“, siehe CLAUDE.md): je Mietvertrag eines oder
// alle auf einmal. Die Seite listet nur die Positionen; das PDF entsteht erst beim Klick (Route
// /api/nebenkostenabrechnung/schreiben, nur lesend).
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
      <SchreibenAuswahl
        abrechnungId={id}
        heute={heute.toISOString().slice(0, 10)}
        frist={frist.toISOString().slice(0, 10)}
        zeilen={zeilen}
      />
    </div>
  );
}
