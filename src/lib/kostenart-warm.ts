// Warme Betriebskosten (Heizung, Warmwasser, verbundene Anlagen — BetrKV § 2 Nr. 4–6). Reine Funktion ohne Prisma.
export const istWarmeKostenart = (k: { name: string; betrKvNummer: number | null }) =>
  (k.betrKvNummer !== null && [4, 5, 6].includes(k.betrKvNummer)) || /heiz|warmwasser/i.test(k.name);
