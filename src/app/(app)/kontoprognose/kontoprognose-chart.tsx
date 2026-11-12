// Verlauf des prognostizierten Kontostands (Monatsenden) als SVG. Reine Anzeige ohne Prisma-Import,
// Farben über die vorhandenen Tailwind-Klassen, damit hell/dunkel funktioniert.
export type ChartPunkt = { label: string; stand: number; tooltip: string };

const B = 820;
const H = 280;
const RAND = { links: 52, rechts: 16, oben: 14, unten: 30 };

/** Gleichmäßige, „runde“ Achsenschritte (1, 2, 5 × 10^n). */
function achsenSchritt(spanne: number): number {
  const roh = spanne / 5;
  const potenz = Math.pow(10, Math.floor(Math.log10(roh)));
  const rest = roh / potenz;
  return (rest <= 1 ? 1 : rest <= 2 ? 2 : rest <= 5 ? 5 : 10) * potenz;
}

const tausend = (v: number) => `${Math.round(v / 1000).toLocaleString("de-DE")} T€`;

export function KontoprognoseChart({ start, punkte, mindestbestand }: { start: ChartPunkt; punkte: ChartPunkt[]; mindestbestand: number }) {
  const alle = [start, ...punkte];
  const werte = alle.map((p) => p.stand);
  const roherMin = Math.min(0, mindestbestand, ...werte);
  const roherMax = Math.max(0, mindestbestand, ...werte);
  const schritt = achsenSchritt(Math.max(roherMax - roherMin, 1000));
  const min = Math.floor(roherMin / schritt) * schritt;
  const max = Math.ceil(roherMax / schritt) * schritt;

  const innen = { b: B - RAND.links - RAND.rechts, h: H - RAND.oben - RAND.unten };
  const x = (i: number) => RAND.links + (alle.length === 1 ? 0 : (i / (alle.length - 1)) * innen.b);
  const y = (v: number) => RAND.oben + (1 - (v - min) / (max - min)) * innen.h;

  const ticks: number[] = [];
  for (let v = min; v <= max + schritt / 2; v += schritt) ticks.push(v);

  const linie = alle.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.stand).toFixed(1)}`).join(" ");
  const flaeche = `${linie} L${x(alle.length - 1).toFixed(1)},${y(Math.max(0, min)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(0, min)).toFixed(1)} Z`;
  // Beschriftung der Monatsachse ausdünnen, damit sie bei 24 Monaten lesbar bleibt.
  const labelAbstand = alle.length > 20 ? 3 : alle.length > 12 ? 2 : 1;

  return (
    <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label="Verlauf des prognostizierten Kontostands" className="w-full">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={RAND.links} x2={B - RAND.rechts} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-neutral-500" : "stroke-neutral-800"} strokeWidth={v === 0 ? 1.2 : 1} />
          <text x={RAND.links - 8} y={y(v) + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">
            {tausend(v)}
          </text>
        </g>
      ))}

      {mindestbestand !== 0 && (
        <g>
          <line x1={RAND.links} x2={B - RAND.rechts} y1={y(mindestbestand)} y2={y(mindestbestand)} className="stroke-amber-400" strokeWidth={1.2} strokeDasharray="5 4" />
          <text x={B - RAND.rechts - 4} y={y(mindestbestand) - 5} textAnchor="end" className="fill-amber-400 text-[11px]">
            Mindestbestand
          </text>
        </g>
      )}

      <path d={flaeche} className="fill-sky-400/10" />
      <path d={linie} className="stroke-sky-400" fill="none" strokeWidth={2} strokeLinejoin="round" />

      {alle.map((p, i) => {
        const kritisch = i > 0 && p.stand < mindestbestand;
        return (
          <g key={`${p.label}-${i}`}>
            <circle cx={x(i)} cy={y(p.stand)} r={i === 0 ? 3 : 3.5} className={kritisch ? "fill-red-400" : i === 0 ? "fill-neutral-400" : "fill-sky-400"}>
              <title>{p.tooltip}</title>
            </circle>
            {(i % labelAbstand === 0 || i === alle.length - 1) && (
              <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-neutral-500 text-[11px]">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
