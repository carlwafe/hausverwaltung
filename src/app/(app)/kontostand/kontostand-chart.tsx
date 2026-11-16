"use client";

import { useEffect, useRef, useState } from "react";

// Verlauf „Kontostand laut Bank“ gegen „Stand laut Buchungen“ je Bankstand-Tag als SVG (Zeitachse, nicht je Tag gleich breit:
// Lücken ohne Umsätze bleiben sichtbar). Fahren/Tippen zeigt Tag, beide Stände und die Differenz. Reine Anzeige ohne
// Prisma-Import; Farben über Tailwind-Klassen (hell/dunkel).
export type KontostandChartPunkt = {
  /** Buchungstag (ISO yyyy-mm-dd). */
  datum: string;
  bank: number;
  app: number;
  /** An diesem Tag hat sich die Differenz geändert. */
  neu: boolean;
};

const RAND = { links: 64, rechts: 16, oben: 14, unten: 30 };
const TAG = 24 * 60 * 60 * 1000;

const euro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
const zeit = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
const tagLang = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(zeit(iso)));
const tagKurz = (ms: number) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(ms));

/** Gleichmäßige, „runde“ Achsenschritte (1, 2, 5 × 10^n). */
function achsenSchritt(spanne: number): number {
  const roh = spanne / 5;
  const potenz = Math.pow(10, Math.floor(Math.log10(roh)));
  const rest = roh / potenz;
  return (rest <= 1 ? 1 : rest <= 2 ? 2 : rest <= 5 ? 5 : 10) * potenz;
}

export function KontostandChart({ punkte }: { punkte: KontostandChartPunkt[] }) {
  const [aktiv, setAktiv] = useState<number | null>(null);
  // Zeichenbreite = Breite des Platzes (1 SVG-Einheit = 1 Pixel), damit die Schrift auf dem Handy nicht schrumpft.
  const platz = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(820);
  useEffect(() => {
    const el = platz.current;
    if (!el) return;
    const messen = () => setBreite(Math.max(300, Math.round(el.clientWidth)));
    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);
  const B = breite;
  const H = breite < 500 ? 260 : 300;

  if (punkte.length === 0) {
    return (
      <div ref={platz}>
        <p className="rounded-lg border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">Keine Bankstände im Zeitraum.</p>
      </div>
    );
  }

  const werte = punkte.flatMap((p) => [p.bank, p.app]);
  const roherMin = Math.min(...werte);
  const roherMax = Math.max(...werte);
  const schritt = achsenSchritt(Math.max(roherMax - roherMin, 100));
  const min = Math.floor(roherMin / schritt) * schritt;
  const max = Math.ceil(roherMax / schritt) * schritt;

  const t0 = zeit(punkte[0].datum);
  const t1 = zeit(punkte[punkte.length - 1].datum);
  const innen = { b: B - RAND.links - RAND.rechts, h: H - RAND.oben - RAND.unten };
  const x = (iso: string) => RAND.links + (t1 === t0 ? innen.b / 2 : ((zeit(iso) - t0) / (t1 - t0)) * innen.b);
  const y = (v: number) => RAND.oben + (1 - (v - min) / (max - min)) * innen.h;

  const yTicks: number[] = [];
  for (let v = min; v <= max + schritt / 2; v += schritt) yTicks.push(v);
  // Fünf Zeitmarken, bei kurzen Zeiträumen weniger.
  const xAnzahl = Math.min(breite < 500 ? 3 : 5, Math.max(2, Math.round((t1 - t0) / TAG / 14) + 1));
  const xTicks = t1 === t0 ? [t0] : Array.from({ length: xAnzahl }, (_, i) => t0 + ((t1 - t0) * i) / (xAnzahl - 1));

  const linie = (feld: "bank" | "app") => punkte.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.datum).toFixed(1)},${y(p[feld]).toFixed(1)}`).join(" ");

  function zeigeNaechsten(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * B;
    let best = 0;
    for (let i = 1; i < punkte.length; i++) {
      if (Math.abs(x(punkte[i].datum) - px) < Math.abs(x(punkte[best].datum) - px)) best = i;
    }
    setAktiv(best);
  }

  const p = aktiv === null ? null : punkte[Math.min(aktiv, punkte.length - 1)];
  const differenz = p ? Math.round((p.app - p.bank) * 100) / 100 : 0;
  const tipLinks = p ? (x(p.datum) / B) * 100 : 0;

  return (
    <div ref={platz}>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" className="stroke-sky-400" strokeWidth={2.5} /></svg>
          Kontostand laut Bank
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" className="stroke-violet-400" strokeWidth={2} strokeDasharray="5 3" /></svg>
          Stand laut Buchungen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="4" className="fill-red-400" /></svg>
          Tag, an dem eine neue Abweichung beginnt
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${B} ${H}`}
          role="img"
          aria-label="Verlauf des Kontostands laut Bank und laut Buchungen"
          className="w-full touch-pan-y"
          onPointerMove={zeigeNaechsten}
          onPointerDown={zeigeNaechsten}
          onPointerLeave={(e) => e.pointerType === "mouse" && setAktiv(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={RAND.links} x2={B - RAND.rechts} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-neutral-500" : "stroke-neutral-800"} strokeWidth={v === 0 ? 1.2 : 1} />
              <text x={RAND.links - 8} y={y(v) + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">
                {Math.round(v).toLocaleString("de-DE")} €
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={t}
              x={RAND.links + (t1 === t0 ? innen.b / 2 : ((t - t0) / (t1 - t0)) * innen.b)}
              y={H - 10}
              textAnchor={xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-neutral-500 text-[11px]">
              {tagKurz(t)}
            </text>
          ))}

          <path d={linie("bank")} className="stroke-sky-400" fill="none" strokeWidth={2.5} strokeLinejoin="round" />
          <path d={linie("app")} className="stroke-violet-400" fill="none" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />

          {punkte.map((q) =>
            q.neu ? <circle key={q.datum} cx={x(q.datum)} cy={y(q.app)} r={4} className="fill-red-400 stroke-neutral-950" strokeWidth={2} /> : null,
          )}

          {p && (
            <g>
              <line x1={x(p.datum)} x2={x(p.datum)} y1={RAND.oben} y2={H - RAND.unten} className="stroke-neutral-500" strokeWidth={1} />
              <circle cx={x(p.datum)} cy={y(p.bank)} r={4} className="fill-sky-400 stroke-neutral-950" strokeWidth={2} />
              <circle cx={x(p.datum)} cy={y(p.app)} r={4} className="fill-violet-400 stroke-neutral-950" strokeWidth={2} />
            </g>
          )}
        </svg>

        {p && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-52 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs shadow-lg"
            style={tipLinks > 55 ? { right: `${100 - tipLinks + 2}%` } : { left: `${tipLinks + 2}%` }}
          >
            <p className="mb-1 font-medium text-white">{tagLang(p.datum)}</p>
            <p className="flex justify-between gap-2 text-neutral-300">
              <span>Bank</span>
              <span className="text-white">{euro(p.bank)}</span>
            </p>
            <p className="flex justify-between gap-2 text-neutral-300">
              <span>Buchungen</span>
              <span className="text-white">{euro(p.app)}</span>
            </p>
            <p className="flex justify-between gap-2 text-neutral-300">
              <span>Differenz</span>
              <span className={Math.abs(differenz) < 0.005 ? "text-green-400" : "text-red-400"}>
                {Math.abs(differenz) < 0.005 ? "stimmt" : euro(differenz)}
              </span>
            </p>
            {p.neu && <p className="mt-1 text-red-400">Hier beginnt eine Abweichung</p>}
          </div>
        )}
      </div>
    </div>
  );
}
