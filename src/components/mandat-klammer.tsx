// Mandatsangaben (SEPA-Lastschrift) für die Vorabankündigung in den Anpassungsschreiben an den Mieter
// (Indexmiete, NK-Vorauszahlung). Die Daten liefert `ladeLastschriftMandat` (src/lib/lastschrift-mandat.ts);
// bewusst ohne Import von dort, damit keine Prisma-Abhängigkeit in Client-Komponenten gelangt.

export type MandatDaten = { referenz: string | null; glaeubigerId: string | null };

/** Die vorhandenen Angaben als Texte ("Mandatsreferenz …", "Gläubiger-ID …"); leer, wenn nichts bekannt ist. */
export function mandatTeile(mandat: MandatDaten | null): string[] {
  return [
    mandat?.referenz && `Mandatsreferenz ${mandat.referenz}`,
    mandat?.glaeubigerId && `Gläubiger-ID ${mandat.glaeubigerId}`,
  ].filter((t): t is string => Boolean(t));
}

/**
 * " (Mandatsreferenz …, Gläubiger-ID …)" hinter "SEPA-Lastschriftmandats"; jeder Teil bleibt beim
 * Zeilenumbruch zusammen (die Referenz enthält Bindestriche). Ohne Angaben entfällt die Klammer.
 */
export function MandatKlammer({ mandat }: { mandat: MandatDaten | null }) {
  const teile = mandatTeile(mandat);
  if (teile.length === 0) return null;
  return (
    <>
      {" ("}
      {teile.map((t, i) => (
        <span key={t}>
          {i > 0 && ", "}
          <span className="whitespace-nowrap">{t}</span>
        </span>
      ))}
      {")"}
    </>
  );
}
