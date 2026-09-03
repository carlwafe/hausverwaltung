export type MieterFuerDuplikatCheck = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
};

export type DuplikatPaar = {
  a: MieterFuerDuplikatCheck;
  b: MieterFuerDuplikatCheck;
  grund: "Ähnlicher Name" | "Gleiche E-Mail";
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Klassische Levenshtein-Distanz (Anzahl Einfüge-/Lösch-/Ersetzoperationen). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + kosten);
    }
    prev = curr;
  }
  return prev[n];
}

/** Tolerant gegenüber Tippfehlern/leicht unterschiedlicher Schreibweise (z.B. Umlaut-Transkription). */
function aehnlicheNamen(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const distanz = levenshtein(na, nb);
  const maxLaenge = Math.max(na.length, nb.length);
  return distanz <= Math.max(1, Math.round(maxLaenge * 0.2));
}

/**
 * Findet mögliche doppelte Mieter — rein informativ, keine automatische Aktion.
 * Telefonnummern werden bewusst nicht berücksichtigt (oft unterschiedlich erfasst/veraltet).
 */
export function findeDuplikate(mieter: MieterFuerDuplikatCheck[]): DuplikatPaar[] {
  const paare: DuplikatPaar[] = [];

  for (let i = 0; i < mieter.length; i++) {
    for (let j = i + 1; j < mieter.length; j++) {
      const a = mieter[i];
      const b = mieter[j];

      if (a.email && b.email && a.email.trim().toLowerCase() === b.email.trim().toLowerCase()) {
        paare.push({ a, b, grund: "Gleiche E-Mail" });
        continue;
      }

      const vollA = `${a.vorname} ${a.nachname}`;
      const vollB = `${b.vorname} ${b.nachname}`;
      // Auch vertauschte Vor-/Nachname-Reihenfolge berücksichtigen (kommt bei Importen vor).
      const vollBVertauscht = `${b.nachname} ${b.vorname}`;
      if (aehnlicheNamen(vollA, vollB) || aehnlicheNamen(vollA, vollBVertauscht)) {
        paare.push({ a, b, grund: "Ähnlicher Name" });
      }
    }
  }

  return paare;
}
