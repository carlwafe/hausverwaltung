import { basisIndexMonat, letzteKaltmietenAenderung, neueIndexmiete, wartejahrErfuellt } from "@/lib/indexmiete";
import { ermittleMieteFuerMonat } from "@/lib/soll-ist";

/**
 * Lässt sich für den Vertrag zum Wirksamkeitstermin `gueltigAb` eine Indexerhöhung erklären, die die Kaltmiete
 * tatsächlich anhebt? Nur aktive Wohnungen (bei Garagen ist die Indexklausel unklar), mit bekanntem Ausgangsdatum,
 * erfülltem Wartejahr und eingetragenen VPI-Werten für Basis- und neuesten Monat. Dient den Querverweisen zwischen
 * „NK-Anpassung“ und „Mieterhöhung“ (kombiniertes Schreiben) — gleiche Regeln wie Liste und Schreiben.
 */
export function indexErhoehungMoeglich(
  v: {
    einheitTyp: string;
    status: string;
    beginn: Date | null;
    kaltmiete: number;
    nebenkostenVorauszahlung: number;
    mieterhoehungen: { gueltigAb: Date; kaltmiete: number; nebenkostenVorauszahlung: number; indexMonat: string | null }[];
  },
  vpi: { jahr: number; monat: number; wert: number }[],
  gueltigAb: Date,
): boolean {
  if (v.einheitTyp !== "WOHNUNG" || v.status !== "AKTIV" || vpi.length === 0) return false;
  const letzte = letzteKaltmietenAenderung(v.kaltmiete, v.mieterhoehungen);
  const referenz = letzte?.gueltigAb ?? v.beginn;
  if (!referenz || !wartejahrErfuellt(referenz, gueltigAb)) return false;
  const bm = basisIndexMonat(referenz, letzte?.indexMonat ?? null);
  const basis = vpi.find((w) => w.jahr === bm.jahr && w.monat === bm.monat);
  if (!basis) return false;
  const neu = vpi.reduce((a, b) => (b.jahr * 12 + b.monat > a.jahr * 12 + a.monat ? b : a));
  const bisher = ermittleMieteFuerMonat(v, gueltigAb.getFullYear(), gueltigAb.getMonth()).kaltmiete;
  return neueIndexmiete(bisher, basis.wert, neu.wert) > bisher + 0.004;
}
