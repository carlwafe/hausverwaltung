import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { ErhoehungenTabelle, type ErhoehungZeile } from "./erhoehungen-tabelle";

// Ein Jahr auf ein Datum addieren — bewusst mit UTC-Gettern/-Constructor statt lokalen (wie z.B.
// gueltigAb aus einem <input type="date"> als UTC-Mitternacht gespeichert wird): mit lokalen
// Gettern würde das Ergebnis je nach Server-Zeitzone um einen Tag verschoben sein. JS normalisiert
// Datumsüberläufe (z.B. 29. Februar) automatisch korrekt.
function plusEinJahr(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
}

function monateBis(heute: Date, ziel: Date): number {
  return (ziel.getUTCFullYear() - heute.getUTCFullYear()) * 12 + (ziel.getUTCMonth() - heute.getUTCMonth());
}

async function ladeZeilen(): Promise<ErhoehungZeile[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    // Nur Wohnungen: bei Garagen ist unklar, ob überhaupt eine Indexmiete-Klausel vereinbart ist.
    where: { status: "AKTIV", einheit: { typ: "WOHNUNG" } },
    include: {
      einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
      mieter: true,
      mieterhoehungen: { orderBy: { gueltigAb: "asc" } },
    },
  });

  const heute = new Date();
  const zeilen: ErhoehungZeile[] = [];
  // Rang in der Haus-Reihenfolge des Objekts (für die Spaltensortierung "Einheit").
  const einheitRang = new Map(
    sortEinheitenNachGebaeude(
      vertraege.map((v) => ({ id: v.id, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude })),
    ).map((v, i) => [v.id, i]),
  );

  for (const v of vertraege) {
    // Ausgangspunkt laut Indexmiete-Klausel: das Datum der letzten Mietanpassung, oder — falls
    // noch nie angepasst — der Mietbeginn. Ein unbekannter Mietbeginn lässt sich nicht berechnen.
    // Nur Einträge, bei denen sich die Kaltmiete gegenüber dem Vorgänger ändert: Reine Anpassungen
    // der NK-Vorauszahlung (§ 560 BGB, kaltmiete unverändert) setzen das Wartejahr laut Vertrag
    // nicht zurück ("abgesehen von Erhöhungen nach den §§ 559 bis 560 BGB").
    let vorherigeKaltmiete = v.kaltmiete;
    let letzteMieterhoehung: (typeof v.mieterhoehungen)[number] | undefined;
    for (const e of v.mieterhoehungen) {
      if (!e.kaltmiete.equals(vorherigeKaltmiete)) letzteMieterhoehung = e;
      vorherigeKaltmiete = e.kaltmiete;
    }
    const referenzDatum = letzteMieterhoehung?.gueltigAb ?? v.beginn;
    if (!referenzDatum) continue;

    const naechsteMoeglich = plusEinJahr(referenzDatum);
    zeilen.push({
      id: v.id,
      einheitBezeichnung: v.einheit.bezeichnung,
      einheitRang: einheitRang.get(v.id) ?? 0,
      mieterNamen: v.mieter.map((m) => mieterName(m)).join(" & ") || "– ohne Mieter –",
      referenzDatum: referenzDatum.toISOString(),
      referenzQuelle: letzteMieterhoehung ? "letzte Mieterhöhung" : "Mietbeginn",
      naechsteMoeglich: naechsteMoeglich.toISOString(),
      bereitsMoeglich: naechsteMoeglich <= heute,
      monateBis: monateBis(heute, naechsteMoeglich),
    });
  }

  return zeilen.sort((a, b) => a.naechsteMoeglich.localeCompare(b.naechsteMoeglich));
}

export default async function MoeglicheErhoehungenPage() {
  const zeilen = await ladeZeilen();
  const bereitsMoeglich = zeilen.filter((z) => z.bereitsMoeglich).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Mieterhöhung möglich ab</h1>
        <p className="text-sm text-neutral-400">
          Laut Indexmiete-Klausel (§ 557b BGB) muss die Miete seit der letzten Anpassung
          mindestens ein Jahr unverändert geblieben sein. Ausgangspunkt ist die letzte erfasste
          Mieterhöhung — oder, falls noch keine erfolgt ist, der Mietbeginn. Nur aktive
          Wohnungs-Mietverträge mit bekanntem Mietbeginn werden gezeigt — Garagen sind
          ausgenommen, da unklar ist, ob dort überhaupt eine Indexmiete vereinbart ist. Reine
          Anpassungen der NK-Vorauszahlung setzen das Wartejahr nicht zurück (§ 560 BGB).{" "}
          <Link href="/mietvertraege/vpi-werte" className="underline">
            VPI-Werte pflegen
          </Link>
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-400">Bereits jetzt möglich</p>
        <p className={`mt-1 text-lg font-semibold ${bereitsMoeglich > 0 ? "text-green-400" : "text-white"}`}>
          {bereitsMoeglich} von {zeilen.length}
        </p>
      </div>

      <ErhoehungenTabelle rows={zeilen} />
    </div>
  );
}
