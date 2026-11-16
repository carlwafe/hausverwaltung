// Gemeinsame Darstellung der Bankzeile (Buchung.rohdaten) für die aufgeklappte Tabellenzeile, den
// Dialog und die Handy-Karte im Import. Bewusst Rohdaten: alle gefüllten Felder in der
// Reihenfolge der Bank, mit den Original-Bezeichnungen und unveränderten Werten — nichts wird
// hervorgehoben, umformatiert oder ausgeblendet. Verbessert ist nur die Lesbarkeit: Bezeichnung
// und Wert stehen als Zeile nebeneinander (Bezeichnungen bündig), mit feiner Trennlinie; lange
// Werte wie der Verwendungszweck bekommen die volle Breite statt einer schmalen Spalte.

/** Ab dieser Länge nimmt ein Wert die volle Breite ein (sonst bricht er in der Spalte mehrfach um). */
const LANG_AB = 60;

export function RohdatenAnsicht({
  rohdaten,
  schmal = false,
}: {
  rohdaten: Record<string, string>;
  /** Für Dialog und Handy-Karte: eine Spalte statt zwei. */
  schmal?: boolean;
}) {
  const eintraege = Object.entries(rohdaten).filter(([, value]) => value);
  if (eintraege.length === 0) return <p className="text-xs text-neutral-500">Keine Angaben.</p>;

  return (
    <dl className={`grid gap-x-10 text-xs ${schmal ? "" : "lg:grid-cols-2"}`}>
      {eintraege.map(([key, value]) => (
        <div
          key={key}
          className={`grid gap-x-3 border-b border-neutral-800 py-1.5 ${schmal ? "grid-cols-[8.5rem_minmax(0,1fr)]" : "grid-cols-[13rem_minmax(0,1fr)]"} ${String(value).length >= LANG_AB ? "col-span-full" : ""}`}
        >
          <dt className="text-neutral-500 [overflow-wrap:anywhere]">{key}</dt>
          <dd className="text-neutral-200 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
