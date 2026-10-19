import type { BelegStatus } from "@/lib/beleg-anzeige";

// Belegstatus einer Kostenposition (siehe src/lib/beleg-status.ts) als kleines Kennzeichen.
export function BelegBadge({ status }: { status: BelegStatus }) {
  switch (status) {
    case "BELEGT":
      return (
        <span title="Beleg vorhanden" className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
          ✓ Beleg
        </span>
      );
    case "AUSNAHME":
      return (
        <span title="Kein Beleg nötig (ausdrücklich markiert)" className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
          kein Beleg nötig
        </span>
      );
    case "FEHLT":
      return (
        <span title="Umlagefähig, aber ohne Beleg" className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
          ⚠ fehlt
        </span>
      );
    default:
      return <span className="text-xs text-neutral-600">–</span>;
  }
}
