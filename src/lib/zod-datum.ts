import { z } from "zod";

// `new Date("2026-02-31")` läuft in V8 über den Monat hinaus und ergibt still den 3.3.2026 — deshalb
// wird ein yyyy-mm-dd-Wert nur akzeptiert, wenn Jahr/Monat/Tag nach dem Erzeugen unverändert sind.
export function parseStrengesDatum(wert: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert.trim());
  if (!m) return null;
  const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  return d;
}

// Pflicht-Datum; leer oder ungültig (z.B. 31.02.) ergibt eine Fehlermeldung statt eines
// stillschweigend verschobenen Datums.
export function pflichtDatum(fehler = "Datum ist erforderlich") {
  return z.string({ error: fehler }).transform((v, ctx) => {
    if (v.trim() === "") {
      ctx.addIssue({ code: "custom", message: fehler });
      return z.NEVER;
    }
    const d = parseStrengesDatum(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Ungültiges Datum (z.B. 31.02. gibt es nicht)" });
      return z.NEVER;
    }
    return d;
  });
}

// Optionales Datum: leer = undefined, ein ausgefüllter, aber ungültiger Wert ist ein Fehler.
export function optionalesDatum() {
  return z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === "") return undefined;
      const d = parseStrengesDatum(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Ungültiges Datum (z.B. 31.02. gibt es nicht)" });
        return z.NEVER;
      }
      return d;
    });
}
