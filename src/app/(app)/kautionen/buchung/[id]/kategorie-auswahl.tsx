"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { aktualisiereKautionsbuchungKategorie } from "../../actions";
import type { KautionBuchungKategorie } from "../../kautionsbuchungen-table";

const OPTIONEN: { value: Exclude<KautionBuchungKategorie, "EINBEHALT">; label: string }[] = [
  { value: "EINZAHLUNG_MIETER", label: "Einzahlung Mieter" },
  { value: "ANLAGE", label: "Anlage (aufs Kautionskonto)" },
  { value: "AUFLOESUNG", label: "Auflösung (vom Kautionskonto)" },
  { value: "AUSZAHLUNG_MIETER", label: "Auszahlung Mieter" },
  { value: "SONSTIGES", label: "Sonstiges (z.B. Korrektur)" },
  { value: "VIRTUELLE_AUSZAHLUNG", label: "Verrechnung mit Rechnung" },
];

// Kategorie ändern = stornieren und mit neuer Buchungsart neu anlegen; danach zeigt die Seite die neue Buchung.
export function KategorieAuswahl({ id, kategorie }: { id: string; kategorie: KautionBuchungKategorie }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      value={kategorie}
      disabled={pending}
      aria-label="Kategorie ändern"
      title="Ändern storniert die Buchung und legt sie mit der neuen Kategorie neu an"
      onChange={(e) =>
        startTransition(async () => {
          const neueId = await aktualisiereKautionsbuchungKategorie(id, e.target.value as Exclude<KautionBuchungKategorie, "EINBEHALT">);
          if (neueId) router.replace(`/kautionen/buchung/${neueId}`);
        })
      }
      className="rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-right text-sm text-white outline-none focus:border-neutral-400 disabled:opacity-50"
    >
      {OPTIONEN.map((o) => (
        <option key={o.value} value={o.value} className="bg-neutral-900 text-white">
          {o.label}
        </option>
      ))}
    </select>
  );
}
