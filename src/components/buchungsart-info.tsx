import Link from "next/link";
import { prisma } from "@/lib/prisma";

const KONTOKREIS: Record<string, string> = {
  MIETKONTO: "Mietkonto",
  KAUTIONSKONTO: "Kautionskonto",
  OBJEKTKONTO: "Objektkonto",
};

function Flag({ label, wert }: { label: string; wert: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${wert ? "bg-green-500/10 text-green-400" : "bg-neutral-800 text-neutral-300"}`}
      >
        {wert ? "Ja" : "Nein"}
      </span>
    </span>
  );
}

/** Zeigt Buchungsart und deren Flags (zahlungswirksam / eur-relevant) mit Link zum Katalog. */
export async function BuchungsartInfo({ code }: { code: string }) {
  const art = await prisma.buchungsart.findUnique({ where: { code } });
  if (!art) return null;
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
      <span>
        Buchungsart: <span className="text-neutral-200">{art.bezeichnung}</span> ({KONTOKREIS[art.kontokreis]})
      </span>
      <Flag label="Zahlungswirksam" wert={art.zahlungswirksam} />
      <Flag label="Eur-relevant" wert={art.eurRelevant} />
      <Link href="/buchungsarten" className="underline hover:text-white">
        alle Buchungsarten &amp; Flags
      </Link>
    </p>
  );
}
