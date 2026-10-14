"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatEuro } from "@/lib/dokumente-anzeige";
import { aendereRateMonat, teileRateAufMonate, fasseRatenZusammen } from "../actions";

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const feld = "rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400";
const knopf = "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50";
const knopfRand = "rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-900 disabled:opacity-50";

const komma = (n: number) => String(n).replace(".", ",");
const alsZahl = (t: string) => {
  const s = t.trim().replace(/\s/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
};

export type PlanRateInfo = { jahr: number; monat: number; rate: number; zins: number };

/** Monat der Rate ändern (Zuordnung für das Darlehenskonto). */
export function MonatForm({ ankerId, jahr, monat }: { ankerId: string; jahr: number; monat: number }) {
  const router = useRouter();
  const [m, setM] = useState(monat);
  const [j, setJ] = useState(jahr);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const geaendert = m !== monat || j !== jahr;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={m} onChange={(e) => setM(Number(e.target.value))} className={`${feld} w-28 shrink-0`} aria-label="Monat">
          {MONATE.map((x, i) => (
            <option key={x} value={i + 1}>
              {x}
            </option>
          ))}
        </select>
        <input type="number" value={j} onChange={(e) => setJ(Number(e.target.value))} className={`${feld} w-24 shrink-0`} aria-label="Jahr" />
        <button
          type="button"
          disabled={pending || !geaendert}
          className={knopfRand}
          onClick={() =>
            start(async () => {
              setFehler(null);
              const meldung = await aendereRateMonat(ankerId, j, m);
              if (typeof meldung === "string") setFehler(meldung);
              else router.refresh();
            })
          }
        >
          {pending ? "Speichern…" : "Monat speichern"}
        </button>
      </div>
      {fehler && <p className="mt-1 text-sm text-red-400">{fehler}</p>}
    </div>
  );
}

type Zeile = { jahr: number; monat: number; rate: string; zins: string; sonder: boolean };

/** Eine Zahlung, die für mehrere Monate galt, auf diese Monate aufteilen. */
export function AufteilenFormular({
  ankerId,
  gesamt,
  jahr,
  monat,
  plan,
  kostenartNoetig,
  zinsArten,
  zielUrl,
}: {
  ankerId: string;
  zielUrl: string;
  gesamt: number;
  jahr: number;
  monat: number;
  plan: PlanRateInfo[];
  kostenartNoetig: boolean;
  zinsArten: { id: string; name: string }[];
}) {
  const router = useRouter();
  const planFuer = (j: number, m: number) => plan.find((p) => p.jahr === j && p.monat === m);
  const folgemonat = (j: number, m: number) => (m === 12 ? { jahr: j + 1, monat: 1 } : { jahr: j, monat: m + 1 });
  const neueZeile = (j: number, m: number): Zeile => {
    const p = planFuer(j, m);
    return { jahr: j, monat: m, rate: p ? komma(p.rate) : "", zins: p ? komma(p.zins) : "", sonder: false };
  };
  // Typischer Fall: die Zahlung deckt den Vormonat (nicht gezahlt) und den laufenden Monat; weitere Monate lassen sich hinzufügen.
  const [zeilen, setZeilen] = useState<Zeile[]>(() => {
    const vormonat = monat === 1 ? { jahr: jahr - 1, monat: 12 } : { jahr, monat: monat - 1 };
    return [neueZeile(vormonat.jahr, vormonat.monat), neueZeile(jahr, monat)];
  });
  const [kostenartId, setKostenartId] = useState(zinsArten.length === 1 ? zinsArten[0].id : "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const summe = Math.round(zeilen.reduce((s, z) => s + (Number.isFinite(alsZahl(z.rate)) ? alsZahl(z.rate) : 0), 0) * 100) / 100;
  const diff = Math.round((gesamt - summe) * 100) / 100;
  const mitZins = zeilen.some((z) => z.sonder || alsZahl(z.zins) > 0);

  const aendere = (i: number, teil: Partial<Zeile>) => setZeilen((l) => l.map((z, j) => (j === i ? { ...z, ...teil } : z)));
  const monatGeaendert = (i: number, j: number, m: number) => {
    const p = planFuer(j, m);
    aendere(i, { jahr: j, monat: m, ...(p ? { rate: komma(p.rate), zins: komma(p.zins) } : {}) });
  };

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-sm text-neutral-400">
        Die Zahlung ({formatEuro(gesamt)}) galt für mehrere Monate und/oder enthält Verzugszinsen o.ä. Je Monat die Rate und den
        Zinsanteil laut Tilgungsplan eintragen (aus dem Plan vorbelegt); Verzugszinsen, Gebühren u.ä. als „Sonderbuchung“ (der ganze
        Betrag ist Zins, kein Monat, nicht im Soll). Die Summe aller Teile muss genau der Zahlung entsprechen. Die Zahlung wird storniert und als eine Rate
        je Monat neu gebucht (gleiche Bankdaten, Kontostand unverändert).
      </p>
      {zeilen.map((z, i) => (
        <div key={i} className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={z.sonder ? "sonder" : "rate"}
            onChange={(e) => aendere(i, { sonder: e.target.value === "sonder", ...(e.target.value === "sonder" ? { zins: "" } : {}) })}
            className={`${feld} shrink-0`}
            aria-label="Art"
          >
            <option value="rate">Rate für Monat</option>
            <option value="sonder">Sonderbuchung</option>
          </select>
          {!z.sonder && (
            <>
              <select value={z.monat} onChange={(e) => monatGeaendert(i, z.jahr, Number(e.target.value))} className={`${feld} w-28 shrink-0`} aria-label="Monat">
                {MONATE.map((x, k) => (
                  <option key={x} value={k + 1}>
                    {x}
                  </option>
                ))}
              </select>
              <input type="number" value={z.jahr} onChange={(e) => monatGeaendert(i, Number(e.target.value), z.monat)} className={`${feld} w-24 shrink-0`} aria-label="Jahr" />
            </>
          )}
          <input value={z.rate} inputMode="decimal" placeholder={z.sonder ? "Betrag (€), z.B. Verzugszinsen" : "Rate (€)"} onChange={(e) => aendere(i, { rate: e.target.value })} className={`${feld} min-w-[7rem] flex-1`} />
          {!z.sonder && (
            <input value={z.zins} inputMode="decimal" placeholder="davon Zinsen (€)" onChange={(e) => aendere(i, { zins: e.target.value })} className={`${feld} min-w-[7rem] flex-1`} />
          )}
          <button type="button" disabled={zeilen.length <= 2} onClick={() => setZeilen((l) => l.filter((_, j) => j !== i))} className={knopfRand} aria-label="Teil entfernen">
            ×
          </button>
        </div>
      ))}
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const letzte = zeilen[zeilen.length - 1];
            const n = folgemonat(letzte.jahr, letzte.monat);
            setZeilen((l) => [...l, neueZeile(n.jahr, n.monat)]);
          }}
          className="text-sm text-neutral-300 underline hover:text-white"
        >
          + Monat hinzufügen
        </button>
        <button type="button" onClick={() => setZeilen((l) => [...l, { jahr, monat, rate: "", zins: "", sonder: true }])} className="text-sm text-neutral-300 underline hover:text-white">
          + Sonderbuchung hinzufügen
        </button>
        <span className={`text-sm ${Math.abs(diff) < 0.005 ? "text-green-400" : "text-amber-400"}`}>
          Summe {formatEuro(summe)} von {formatEuro(gesamt)}
          {Math.abs(diff) >= 0.005 ? ` – ${diff > 0 ? "es fehlen" : "zu viel:"} ${formatEuro(Math.abs(diff))}` : " ✓"}
        </span>
      </div>
      {mitZins && kostenartNoetig && (
        <select value={kostenartId} onChange={(e) => setKostenartId(e.target.value)} className={`${feld} mb-3 block`}>
          <option value="">– Kostenart der Zinsen (Schuldzinsen) wählen –</option>
          {zinsArten.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      )}
      {fehler && <p className="mb-2 text-sm text-red-400">{fehler}</p>}
      <button
        type="button"
        disabled={pending || Math.abs(diff) >= 0.005}
        className={knopf}
        onClick={() =>
          start(async () => {
            setFehler(null);
            const meldung = await teileRateAufMonate(
              ankerId,
              zeilen.map((z) => ({ jahr: z.jahr, monat: z.monat, rate: alsZahl(z.rate), zins: Number.isFinite(alsZahl(z.zins)) ? alsZahl(z.zins) : 0, sonder: z.sonder })),
              kostenartId || null,
            );
            if (typeof meldung === "string") setFehler(meldung);
            else router.push(zielUrl);
          })
        }
      >
        {pending ? "Teile…" : `In ${zeilen.length} Teile aufteilen`}
      </button>
    </div>
  );
}

export function ZusammenfuehrenKnopf({ ankerId }: { ankerId: string }) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={knopfRand}
        onClick={() => {
          if (!window.confirm("Aufteilung rückgängig machen? Alle Teile werden storniert und als eine Rate (erster Monat) neu gebucht.")) return;
          start(async () => {
            setFehler(null);
            const meldung = await fasseRatenZusammen(ankerId);
            if (typeof meldung === "string") setFehler(meldung);
            else router.push("/darlehen/tilgungsplan");
          });
        }}
      >
        {pending ? "Arbeite…" : "Aufteilung rückgängig machen"}
      </button>
      {fehler && <p className="mt-1 text-sm text-red-400">{fehler}</p>}
    </div>
  );
}
