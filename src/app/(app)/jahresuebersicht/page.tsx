import { BerichtSeite } from "./bericht-seite";
import { JahrFilterForm } from "./jahr-filter-form";

export default async function JahresuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; quartal?: string }>;
}) {
  const { jahr, quartal } = await searchParams;

  // Ohne Auswahl (Aufruf über das Menü) wird nur die Auswahl gezeigt — der Bericht rechnet erst
  // nach "Anzeigen" (spart Rechenzeit, siehe CLAUDE.md "Vercel-Kontingent").
  if (jahr === undefined && quartal === undefined) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">Jahresübersicht</h1>
          <p className="text-sm text-neutral-400">
            Jahr und Zeitraum wählen und auf „Anzeigen“ klicken.
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <JahrFilterForm jahr={new Date().getFullYear()} quartal={0} />
        </div>
      </div>
    );
  }

  const q = Number(quartal);
  return (
    <BerichtSeite jahr={Number(jahr) || new Date().getFullYear()} quartal={q >= 1 && q <= 4 ? q : 0} />
  );
}
