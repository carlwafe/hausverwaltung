import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { ermittleAktuelleMiete } from "@/lib/soll-ist";
import { basisIndexMonat, letzteKaltmietenAenderung, neueIndexmiete } from "@/lib/indexmiete";
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
  // VPI-Monatswerte (Tabelle "VPI-Werte"): Schlüssel jahr*12+monat-1. Neuester Wert = "neuer Index".
  const vpiWerte = await prisma.verbraucherpreisindex.findMany({ orderBy: [{ jahr: "desc" }, { monat: "desc" }] });
  const vpi = new Map(vpiWerte.map((w) => [w.jahr * 12 + w.monat - 1, Number(w.wert)]));
  const neuester = vpiWerte[0];
  // Rang in der Haus-Reihenfolge des Objekts (für die Spaltensortierung "Einheit").
  const einheitRang = new Map(
    sortEinheitenNachGebaeude(
      vertraege.map((v) => ({ id: v.id, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude })),
    ).map((v, i) => [v.id, i]),
  );

  for (const v of vertraege) {
    // Ausgangspunkt laut Indexmiete-Klausel: das Datum der letzten Mietanpassung, oder — falls
    // noch nie angepasst — der Mietbeginn. Ein unbekannter Mietbeginn lässt sich nicht berechnen.
    // Nur Kaltmieten-Änderungen zählen (siehe letzteKaltmietenAenderung in src/lib/indexmiete.ts).
    const letzteAenderung = letzteKaltmietenAenderung(
      Number(v.kaltmiete),
      v.mieterhoehungen.map((e) => ({ gueltigAb: e.gueltigAb, kaltmiete: Number(e.kaltmiete), indexMonat: e.indexMonat })),
    );
    const referenzDatum = letzteAenderung?.gueltigAb ?? v.beginn;
    if (!referenzDatum) continue;

    const naechsteMoeglich = plusEinJahr(referenzDatum);

    // Indexmiete: Basis = bei der letzten Erhöhung zugrunde gelegter Index (falls erfasst), sonst der
    // VPI des Referenzmonats selbst (Variante C); neu = neuester eingetragener VPI. Neue Kaltmiete = aktuelle Kaltmiete × neu ÷ Basis.
    const aktuelleKalt = ermittleAktuelleMiete({
      kaltmiete: Number(v.kaltmiete),
      nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
      mieterhoehungen: v.mieterhoehungen.map((e) => ({
        gueltigAb: e.gueltigAb,
        kaltmiete: Number(e.kaltmiete),
        nebenkostenVorauszahlung: Number(e.nebenkostenVorauszahlung),
      })),
    } as never).kaltmiete;
    const basisMonatVor = basisIndexMonat(referenzDatum, letzteAenderung?.indexMonat ?? null);
    const basisSchluessel = basisMonatVor.jahr * 12 + basisMonatVor.monat - 1;
    const basisIndex = vpi.get(basisSchluessel) ?? null;
    const neuerIndex = neuester ? Number(neuester.wert) : null;
    const hatIndex = basisIndex !== null && neuerIndex !== null;
    zeilen.push({
      id: v.id,
      einheitBezeichnung: v.einheit.bezeichnung,
      einheitRang: einheitRang.get(v.id) ?? 0,
      mieterNamen: v.mieter.map((m) => mieterName(m)).join(" & ") || "– ohne Mieter –",
      referenzDatum: referenzDatum.toISOString(),
      referenzQuelle: letzteAenderung ? "letzte Mieterhöhung" : "Mietbeginn",
      naechsteMoeglich: naechsteMoeglich.toISOString(),
      bereitsMoeglich: naechsteMoeglich <= heute,
      monateBis: monateBis(heute, naechsteMoeglich),
      aktuelleKalt,
      basisMonat: `${String(basisMonatVor.monat).padStart(2, "0")}/${basisMonatVor.jahr}`,
      basisIndex,
      neuerMonat: neuester ? `${String(neuester.monat).padStart(2, "0")}/${neuester.jahr}` : null,
      neuerIndex,
      aenderungProzent: hatIndex ? (neuerIndex / basisIndex - 1) * 100 : null,
      neueKalt: hatIndex ? neueIndexmiete(aktuelleKalt, basisIndex, neuerIndex) : null,
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
          Anpassungen der NK-Vorauszahlung setzen das Wartejahr nicht zurück (§ 560 BGB). Die Spalten
          rechts sind eine Vorschau: Basisindex = bei der letzten Erhöhung zugrunde gelegter Index
          (unter „Mietvertrag bearbeiten“ je Mieterhöhung erfassbar), sonst der VPI des Monats der
          letzten Kaltmieten-Änderung bzw. des Mietbeginns; neuer Index = neuester eingetragener VPI.{" "}
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
