// Erkennt vermutliche Mieterhöhungen rein aus der Zahlungshistorie (periodenweise gezahlte
// Beträge) — reine Funktionen auf einfachen Datenstrukturen, damit sie ohne Prisma-Zugriff isoliert
// testbar sind (z.B. per tsx-Skript gegen echte Daten). Die aufrufende Seite lädt die Daten,
// gleicht das Ergebnis gegen bereits bekannte/verworfene Vorschläge ab und rendert es.

export type PeriodenSumme = { jahr: number; monat: number; summe: number };

export type ErkannterWechsel = {
  vonBetrag: number;
  zuBetrag: number;
  abJahr: number;
  abMonat: number;
};

export type ErkennungsErgebnis = {
  wechsel: ErkannterWechsel[];
  // Die beim "Warm-Start" gefundene erste stabile Periode — Basis für den Hinweis, ob der
  // Mietvertrags-Basiswert (der laut Schema "ab Mietbeginn" gilt) zur ältesten tatsächlich
  // gezahlten Periode passt.
  aeltestesPlateau: PeriodenSumme | null;
};

// Mindest-Differenz, damit ein Plateau-Wechsel überhaupt als Vorschlag zählt — bei den in dieser
// App üblichen Warmmieten (300–700 €) liegt jede echte Mieterhöhung deutlich darüber, während
// beobachtetes Rundungsrauschen bei Teilzahlungen im Cent- bis niedrigen Euro-Bereich bleibt.
const MIN_DIFFERENZ = 3;
// Ein neuer Betrag gilt erst als stabiles Plateau, wenn er sich über mindestens so viele
// aufeinanderfolgende Perioden hält — filtert einzelne Ausreißer (Korrekturmonate,
// Doppel-/Aufholzahlungen) zuverlässig heraus, ohne sie eigens erkennen zu müssen.
const MIN_DAUER = 2;
// Wie nah zwei Perioden beieinander liegen müssen, um als "derselbe Betrag" zu gelten — deckt
// Rundungsdifferenzen bei mehrteiligen Zahlungen ab.
const SELBST_TOLERANZ = 1;

function periodenIndex(p: Pick<PeriodenSumme, "jahr" | "monat">): number {
  return p.jahr * 12 + p.monat;
}

/**
 * Gruppiert Zahlungen nach Periode (periodeJahr/periodeMonat) und summiert den Betrag — deckt
 * aufgeteilte Zahlungen automatisch ab, da jeder Teil seine eigene Periode trägt. Perioden mit
 * Summe ≤ 0 (reine Korrekturmonate/Rückerstattungen ohne echte Mietzahlung) werden als Lücke
 * ausgelassen statt als Wert gewertet. Chronologisch sortiert.
 */
export function periodenSummenAusZahlungen(
  zahlungen: { periodeJahr: number; periodeMonat: number; betrag: number }[],
): PeriodenSumme[] {
  const summenProPeriode = new Map<string, PeriodenSumme>();
  for (const z of zahlungen) {
    const key = `${z.periodeJahr}-${z.periodeMonat}`;
    const bestehend = summenProPeriode.get(key);
    if (bestehend) {
      bestehend.summe += z.betrag;
    } else {
      summenProPeriode.set(key, { jahr: z.periodeJahr, monat: z.periodeMonat, summe: z.betrag });
    }
  }
  return [...summenProPeriode.values()]
    .filter((p) => p.summe > 0)
    .sort((a, b) => periodenIndex(a) - periodenIndex(b));
}

/**
 * Erkennt stabile Zahlbetrags-Wechsel ("Plateau-Wechsel") in einer chronologischen Periodenreihe.
 *
 * Warm-Start statt den ersten Wert blind als Basis zu nehmen: gesucht wird die erste Stelle mit
 * mindestens MIN_DAUER aufeinanderfolgenden, zueinander passenden Perioden — alles davor gilt als
 * noch nicht eingeschwungen (typischer unruhiger Vertragsbeginn) und wird verworfen statt fälschlich
 * als Wechsel gewertet.
 *
 * Ab dort: weicht eine Periode vom aktuellen Plateau ab, wird geprüft, ob sich der neue Wert über
 * mindestens MIN_DAUER Folgeperioden hält (Kandidatenlauf). Hält er sich und die Differenz ist ≥
 * MIN_DIFFERENZ, gilt es als Wechsel und das Plateau wird aktualisiert. Hält er sich nicht (ein
 * einzelner Ausreißer wie ein Korrekturmonat oder eine Doppel-/Aufholzahlung), wird die Periode
 * ignoriert und das Plateau bleibt unverändert.
 */
export function erkenneMietwechsel(perioden: PeriodenSumme[]): ErkennungsErgebnis {
  // Warm-Start: erste Stelle mit einem stabilen Lauf von mindestens MIN_DAUER Perioden finden.
  let start = -1;
  for (let i = 0; i + MIN_DAUER <= perioden.length; i++) {
    let stabil = true;
    for (let j = i + 1; j < i + MIN_DAUER; j++) {
      if (Math.abs(perioden[j].summe - perioden[i].summe) > SELBST_TOLERANZ) {
        stabil = false;
        break;
      }
    }
    if (stabil) {
      start = i;
      break;
    }
  }
  if (start === -1) return { wechsel: [], aeltestesPlateau: null };

  const wechsel: ErkannterWechsel[] = [];
  let plateauWert = perioden[start].summe;
  let i = start + 1;
  while (i < perioden.length) {
    const p = perioden[i];
    if (Math.abs(p.summe - plateauWert) <= SELBST_TOLERANZ) {
      i++;
      continue;
    }
    // Kandidat für ein neues Plateau: prüfen, ob er sich über mindestens MIN_DAUER Perioden hält.
    const kandidatWert = p.summe;
    let j = i + 1;
    while (j < perioden.length && Math.abs(perioden[j].summe - kandidatWert) <= SELBST_TOLERANZ) {
      j++;
    }
    const kandidatLaenge = j - i;
    if (kandidatLaenge >= MIN_DAUER) {
      if (Math.abs(kandidatWert - plateauWert) >= MIN_DIFFERENZ) {
        wechsel.push({ vonBetrag: plateauWert, zuBetrag: kandidatWert, abJahr: p.jahr, abMonat: p.monat });
      }
      plateauWert = kandidatWert;
      i = j;
    } else {
      i++;
    }
  }

  return { wechsel, aeltestesPlateau: perioden[start] };
}
