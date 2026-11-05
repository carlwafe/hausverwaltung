import Link from "next/link";
import type { BelegLueckenJahr } from "@/lib/beleg-pruefung";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

// Hinweis (kein Sperren) auf Kostenpositionen des Jahres ohne Beleg — bei einer Prüfung kann das Finanzamt zu jeder
// Ausgabe einen Beleg verlangen. Zahlen aus zaehleBelegLueckenJahr (src/lib/beleg-pruefung.ts).
export function BelegLueckenHinweis({ jahr, luecken }: { jahr: number; luecken: BelegLueckenJahr }) {
  if (luecken.gesamt === 0) return null;
  const vollstaendig = luecken.fehlt === 0;
  return (
    <div
      className={`print:hidden mb-6 max-w-3xl rounded-lg border p-4 text-sm ${
        vollstaendig ? "border-green-500/30 text-green-400" : "border-amber-500/30 text-amber-400"
      }`}
    >
      {vollstaendig ? (
        <p>Alle {luecken.gesamt} beleg-pflichtigen Kostenpositionen {jahr} haben einen Beleg oder sind als „Kein Beleg nötig“ markiert.</p>
      ) : (
        <>
          <p>
            Beleg fehlt bei {luecken.fehlt} von {luecken.gesamt} beleg-pflichtigen Kostenpositionen {jahr} ({formatEuro(luecken.betragFehlt)}).
            Bei einer Prüfung kann das Finanzamt zu jeder Ausgabe einen Beleg verlangen.{" "}
            <Link href="/kosten" prefetch={false} className="underline hover:text-white">
              Kosten öffnen
            </Link>{" "}
            (Filter „Beleg fehlt“).
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Am meisten fehlt bei:{" "}
            {luecken.nachKostenart
              .slice(0, 5)
              .map((k) => `${k.name} (${k.fehlt})`)
              .join(", ")}
            {luecken.nachKostenart.length > 5 ? ", …" : ""}
          </p>
        </>
      )}
    </div>
  );
}
