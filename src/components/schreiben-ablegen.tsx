"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { uploadDokument } from "@/app/(app)/dokumente/actions";
import { formatBytes, formatDate } from "@/lib/dokumente-anzeige";
import { MAX_DOKUMENT_GROESSE_BYTES, ermittleZuGrosseDateien } from "@/lib/upload-limits";
import { GroessenFehler } from "@/components/groessen-fehler";

export type SchreibenKopie = {
  id: string;
  dateiname: string;
  // ISO-Datum des Schreibens (Belegdatum) bzw. null.
  belegDatum: string | null;
  createdAt: string;
};

/**
 * Legt die Kopie eines versandten Schreibens (als PDF aus dem Druckdialog) in der Mieterakte ab —
 * Art „Schreiben“, Belegdatum = Datum des Schreibens. Die Schreiben werden nur gedruckt, nicht in der
 * App gespeichert; so bleibt nachweisbar, was wann an den Mieter ging (z.B. Zugang einer
 * Erhöhungserklärung).
 */
export function SchreibenAblegen({
  mietvertragId,
  revalidatePath,
  belegDatumIso,
  kopien,
}: {
  mietvertragId: string;
  revalidatePath: string;
  /** Datum des Schreibens (Feld im Schreiben), wird als Belegdatum übernommen. */
  belegDatumIso: string;
  kopien: SchreibenKopie[];
}) {
  const [error, formAction, pending] = useActionState(uploadDokument.bind(null, { mietvertragId, revalidatePath }), null);
  const [groessenFehler, setGroessenFehler] = useState<string | null>(null);
  const maxMb = MAX_DOKUMENT_GROESSE_BYTES / (1024 * 1024);

  return (
    <div className="mt-4 rounded-md border border-neutral-800 p-3">
      <p className="mb-1 text-sm font-medium text-white">Kopie in der Mieterakte ablegen</p>
      <p className="mb-2 text-xs text-neutral-500">
        Nach dem Versand: oben „drucken / als PDF“ → als PDF sichern, dann hier hochladen. Das Schreiben wird nur
        gedruckt, nicht in der App gespeichert. Belegdatum ist das Datum des Schreibens
        {belegDatumIso && ` (${formatDate(new Date(belegDatumIso))})`}.
      </p>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="art" value="SCHREIBEN" />
        <input type="hidden" name="belegDatum" value={belegDatumIso} />
        <input
          type="file"
          name="file"
          accept="application/pdf,.pdf"
          required
          onChange={(e) => {
            const zuGross = ermittleZuGrosseDateien(e.target.files, MAX_DOKUMENT_GROESSE_BYTES);
            if (zuGross.length > 0) {
              setGroessenFehler(`Maximal ${maxMb} MB: ${zuGross.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}.`);
              e.target.value = "";
            } else {
              setGroessenFehler(null);
            }
          }}
          className="text-sm text-neutral-300 file:mr-3 file:rounded-md file:border file:border-neutral-700 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:text-white"
        />
        <button
          type="submit"
          disabled={pending || groessenFehler !== null}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Lädt hoch…" : "Ablegen"}
        </button>
      </form>
      <GroessenFehler text={groessenFehler} />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {kopien.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-neutral-500">
            Bereits abgelegte Schreiben (
            <Link href={`/dokumente?bereich=mietvertraege&ordner=${mietvertragId}`} className="underline">
              in der Mieterakte öffnen
            </Link>
            ):
          </p>
          <ul className="space-y-0.5 text-sm">
            {kopien.map((k) => (
              <li key={k.id}>
                <a href={`/api/dokumente/${k.id}/download`} className="text-neutral-300 hover:text-white hover:underline [overflow-wrap:anywhere]">
                  {k.dateiname}
                </a>
                <span className="ml-2 text-xs text-neutral-500">{formatDate(new Date(k.belegDatum ?? k.createdAt))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
