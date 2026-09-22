import { prisma } from "@/lib/prisma";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { ZeitachseChart, type EinheitZeile } from "./zeitachse-chart";

async function ladeZeitachseDaten(): Promise<EinheitZeile[]> {
  const einheitenRaw = await prisma.einheit.findMany({
    include: {
      gebaeude: { include: { haus: { include: { gebaeude: true } } } },
      // Anders als auf /einheiten bewusst ALLE Mietverträge (nicht nur AKTIV) — auch beendete
      // und geplante Verträge sind für die Überlappungsprüfung und die historische Übersicht
      // relevant.
      mietvertraege: {
        include: { mieter: true },
        orderBy: { beginn: "asc" },
      },
    },
  });

  return sortEinheitenNachGebaeude(einheitenRaw).map((e) => ({
    id: e.id,
    gebaeudeStrasse: e.gebaeude.strasse,
    gebaeudeHausnummer: e.gebaeude.hausnummer,
    bezeichnung: e.bezeichnung,
    mietvertraege: e.mietvertraege.map((v) => ({
      id: v.id,
      beginn: v.beginn ? v.beginn.toISOString() : null,
      ende: v.ende ? v.ende.toISOString() : null,
      status: v.status,
      mieterNamen: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") || "– ohne Mieter –",
    })),
  }));
}

export default async function ZeitachsePage() {
  const einheiten = await ladeZeitachseDaten();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Zeitachse</h1>
        <p className="text-sm text-neutral-400">
          Mietverträge aller Einheiten auf einem gemeinsamen Zeitstrahl — Überlappungen werden rot
          markiert.
        </p>
      </div>

      {/* "Heute" wird einmal hier auf dem Server berechnet und als fester Wert durchgereicht,
          statt dass die Client-Komponente selbst new Date() aufruft — sonst weicht der Zeitpunkt
          zwischen Server-Rendering und Client-Hydration minimal voneinander ab (SSR und Hydration
          finden nie exakt zur selben Millisekunde statt), was zu einem Hydration-Mismatch bei den
          prozentualen Balkenpositionen offener Verträge führt. */}
      <ZeitachseChart einheiten={einheiten} heuteIso={new Date().toISOString()} />
    </div>
  );
}
