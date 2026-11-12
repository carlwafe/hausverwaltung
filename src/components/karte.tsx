// Bausteine für den Inhalt einer Karte der Kartenansicht fürs Handy (`mobileCard` an DataTable),
// damit alle Listen gleich aufgebaut sind: Kopf (Hauptangabe links, Wert/Kennzeichen rechts),
// zweite Angabe, Zeile mit Datum und Kennzeichen, Zahlenwerte, klein der Freitext.
// Regeln: docs/tickets-logo-design.md („Tabellen auf dem Handy: Kartenansicht“).

/** Kleines Kennzeichen (Pille) in einer Karte. */
export const KARTE_KENNZEICHEN = "whitespace-nowrap rounded-full px-2 py-0.5 text-xs";

/** Link oder Knopf in einer Karte mit `mobileCardInteraktiv` (z.B. „Schreiben erstellen“, Telefonnummer). */
export const KARTE_AKTION =
  "inline-flex h-9 min-w-0 max-w-full items-center whitespace-nowrap rounded-md border border-neutral-700 px-3 text-sm font-medium text-white active:bg-neutral-800";

/** Vorzeichenfarbe für Salden: negativ rot, positiv grün, null neutral. */
export function saldoFarbe(wert: number): string {
  return wert < 0 ? "text-red-400" : wert > 0 ? "text-green-400" : "text-white";
}

/** Kopfzeile: Hauptangabe groß links, rechts ein Betrag oder Kennzeichen. */
export function KarteKopf({
  titel,
  wert,
  wertKlasse = "text-white",
  wertLabel,
}: {
  titel: React.ReactNode;
  wert?: React.ReactNode;
  wertKlasse?: string;
  /** Kleine Beschriftung unter dem Wert (z.B. „Saldo“), wenn er sich nicht von selbst erklärt. */
  wertLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0 text-base font-medium leading-snug text-white [overflow-wrap:anywhere]">{titel}</span>
      {wert !== undefined && wert !== null && (
        <span className="shrink-0 text-right">
          <span className={`block whitespace-nowrap text-base font-medium tabular-nums ${wertKlasse}`}>{wert}</span>
          {wertLabel && <span className="block text-xs text-neutral-500">{wertLabel}</span>}
        </span>
      )}
    </div>
  );
}

/** Zweite Angabe unter dem Kopf (Mieter, Empfänger …). */
export function KarteZeile({ children }: { children: React.ReactNode }) {
  return <div className="mt-0.5 text-sm text-neutral-300 [overflow-wrap:anywhere]">{children}</div>;
}

/** Zeile mit Datum, kurzen Angaben und Kennzeichen; bricht um. */
export function KarteMeta({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">{children}</div>;
}

/** Freitext (Verwendungszweck, Kommentar), klein und auf eine Zeile gekürzt. */
export function KarteNotiz({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 truncate text-xs text-neutral-500">{children}</div>;
}

/** Zahlenwerte mit Beschriftung, drei je Zeile. Einträge mit `false`/`null` entfallen. */
export function KarteWerte({
  werte,
}: {
  werte: ({ label: string; wert: React.ReactNode; klasse?: string } | false | null | undefined)[];
}) {
  const sichtbar = werte.filter((w): w is { label: string; wert: React.ReactNode; klasse?: string } => Boolean(w));
  if (sichtbar.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
      {sichtbar.map((w) => (
        <div key={w.label} className="flex min-w-0 flex-col justify-end">
          <dt className="text-xs leading-tight text-neutral-500 [overflow-wrap:anywhere]">{w.label}</dt>
          <dd className={`whitespace-nowrap text-sm tabular-nums ${w.klasse ?? "text-neutral-200"}`}>{w.wert}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Zeile mit Links/Knöpfen am Fuß einer Karte (nur mit `mobileCardInteraktiv`). */
export function KarteAktionen({ children }: { children: React.ReactNode }) {
  return <div className="mt-2.5 flex flex-wrap items-center gap-2">{children}</div>;
}
