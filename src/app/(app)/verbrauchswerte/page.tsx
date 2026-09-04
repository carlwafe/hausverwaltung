import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { VerbrauchswerteFilterForm } from "./filter-form";
import { VerbrauchswerteForm } from "./verbrauchswerte-form";

export default async function VerbrauchswertePage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; kostenartId?: string }>;
}) {
  const { jahr: jahrParam, kostenartId: kostenartIdParam } = await searchParams;
  const jahr = Number(jahrParam) || new Date().getFullYear() - 1;

  const kostenarten = await prisma.kostenart.findMany({
    where: { standardVerteilerschluessel: "VERBRAUCH_MANUELL" },
    orderBy: { name: "asc" },
  });
  const ausgewaehlteKostenart =
    kostenarten.find((k) => k.id === kostenartIdParam) ?? null;

  const [einheitenRaw, vorhandeneWerte] = await Promise.all([
    prisma.einheit.findMany({ where: { typ: "WOHNUNG" }, include: { gebaeude: true } }),
    ausgewaehlteKostenart
      ? prisma.verbrauchswert.findMany({
          where: { jahr, kostenartId: ausgewaehlteKostenart.id },
        })
      : Promise.resolve([]),
  ]);

  const wertProEinheit = new Map(vorhandeneWerte.map((v) => [v.einheitId, Number(v.wert)]));
  const einheiten = sortEinheitenNachGebaeude(einheitenRaw).map((e) => ({
    id: e.id,
    bezeichnung: e.bezeichnung,
    adresse: `${e.gebaeude.strasse} ${e.gebaeude.hausnummer}`,
    wert: wertProEinheit.get(e.id) ?? null,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Verbrauchswerte</h1>
        <p className="text-sm text-neutral-400">
          Ablesewerte pro Einheit und Jahr für verbrauchsbasiert umgelegte Kostenarten (z.B.
          Kaltwasser, Strom). Wird für die Nebenkostenabrechnung zur Verteilung nach tatsächlichem
          Verbrauch genutzt.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <VerbrauchswerteFilterForm
          jahr={jahr}
          kostenartId={ausgewaehlteKostenart?.id ?? ""}
          kostenarten={kostenarten.map((k) => ({ id: k.id, name: k.name, masseinheit: k.masseinheit }))}
        />
      </div>

      {kostenarten.length === 0 && (
        <p className="text-sm text-neutral-500">
          Keine Kostenart mit Verteilerschlüssel &quot;Verbrauch (manuell erfasst)&quot;
          vorhanden. Unter{" "}
          <Link href="/kostenarten" className="underline">
            Kostenarten
          </Link>{" "}
          anlegen oder anpassen.
        </p>
      )}

      {kostenarten.length > 0 && !ausgewaehlteKostenart && (
        <p className="text-sm text-neutral-500">Bitte oben eine Kostenart auswählen.</p>
      )}

      {ausgewaehlteKostenart && (
        <VerbrauchswerteForm
          jahr={jahr}
          kostenartId={ausgewaehlteKostenart.id}
          masseinheit={ausgewaehlteKostenart.masseinheit}
          einheiten={einheiten}
        />
      )}
    </div>
  );
}
